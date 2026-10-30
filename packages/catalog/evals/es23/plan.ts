import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../../src/consumers.ts';
import type { Release } from '../../src/schema.ts';
import {
  DEFAULT_BUDGET,
  dockerRunArgs,
  isolationProblems,
  liveBlockers,
  type EvalAgent,
} from './isolation.ts';
import { ES23_TASKS, SECURITY_TASKS, es23TaskProblems, type Es23Task } from './tasks.ts';

/*
 * ES23 pilot planner. Writes identical fixture workspaces per task, arm and agent, the exact container command for
 * each run, and the live-run gate. It never starts an agent: `--live` only reports blockers, and with none left it
 * still stops, because the first live run is the owner's to start (see docs/es23-pilot.md).
 *
 *   tsx evals/es23/plan.ts [--out <dir>] [--live]
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const AGENTS: EvalAgent[] = ['claude-code', 'codex'];
export const SKILL_DIR: Record<EvalAgent, string> = {
  'claude-code': '.claude/skills',
  codex: '.agents/skills',
};

/** Agent CLI invocation inside the container. Flags are taken from each CLI's help; not exercised in ES23. */
export function agentCommand(
  agent: EvalAgent,
  prompt: string,
  maxTurns = DEFAULT_BUDGET.maxTurns,
): string[] {
  return agent === 'claude-code'
    ? [
        'claude',
        '-p',
        prompt,
        '--output-format',
        'stream-json',
        '--verbose',
        '--max-turns',
        String(maxTurns),
        '--dangerously-skip-permissions',
      ]
    : [
        'codex',
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--dangerously-bypass-approvals-and-sandbox',
        prompt,
      ];
}

/** A release has passed preflight when its review is complete and not blocking, for the exact curated content. */
export function preflightPassed(r: Release | undefined): boolean {
  return (
    !!r &&
    r.review.outcome === 'no-blocking-issues' &&
    r.review.contentHash === r.curatedHash &&
    r.review.checks.length === 26 &&
    r.review.checks.every((c) => c.result === 'no-issue-found') &&
    r.references.every((x) => x.resolution !== 'unresolved')
  );
}

export interface PlannedRun {
  task: string;
  agent: EvalAgent;
  arm: 'A-without' | `B-${string}`;
  release?: { skill: string; version: string; curatedHash: string };
  workspace: string;
  command: string[];
}

export function planRuns(tasks: Es23Task[], releases: Release[], base: string): PlannedRun[] {
  const runs: PlannedRun[] = [];
  const candidates = ES23_TASKS.flatMap((t) => t.candidates);
  for (const t of tasks) {
    const armsB = t.candidates.length ? t.candidates : candidates;
    for (const agent of AGENTS) {
      const arms: PlannedRun['arm'][] = [
        'A-without',
        ...armsB.map((c) => `B-${c.skill}@${c.version}` as const),
      ];
      for (const arm of arms) {
        const c = armsB.find((x) => arm === `B-${x.skill}@${x.version}`);
        const r = c && releases.find((x) => x.skill === c.skill && x.version === c.version);
        const workspace = join(base, t.id, agent, arm);
        runs.push({
          task: t.id,
          agent,
          arm,
          release: r
            ? { skill: r.skill, version: r.version, curatedHash: r.curatedHash }
            : undefined,
          workspace,
          command: dockerRunArgs({
            name: `es23-${t.id}-${agent}-${arm}`.replace(/[^a-zA-Z0-9_.-]/g, '-'),
            image: `es23-eval-${agent}:pinned`,
            network: 'es23-internal',
            proxy: 'http://egress:3128',
            workspace,
            agent,
            envFile: '<0600 file with the dedicated evaluation key, created per run>',
            command: agentCommand(agent, t.prompt),
          }),
        });
      }
    }
  }
  return runs;
}

function writeFixtures(t: Es23Task, run: PlannedRun) {
  for (const [f, body] of Object.entries(t.files)) {
    const p = join(run.workspace, f);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]!) : undefined;
  const tasks = [...ES23_TASKS, ...SECURITY_TASKS];
  const problems = tasks.flatMap(es23TaskProblems);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const { catalog } = loadRegistry(root);
  const docker = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
  const report = join(dirname(fileURLToPath(import.meta.url)), 'results/isolation-2026-10-30.json');
  const isolationVerified =
    existsSync(report) && (JSON.parse(readFileSync(report, 'utf8')) as { passed: boolean }).passed;
  console.log('ES23 live-run gate (no agent is started by this planner):');
  for (const c of ES23_TASKS.flatMap((t) => t.candidates)) {
    const r = catalog.releases.find((x) => x.skill === c.skill && x.version === c.version);
    for (const agent of AGENTS) {
      const b = liveBlockers(agent, {
        docker,
        isolationVerified,
        agentImage: false,
        ownerAuthorized: false,
        reviewed: preflightPassed(r),
      });
      console.log(
        `  ${c.skill}@${c.version} / ${agent}: ${b.length ? `BLOCKED: ${b.join('; ')}` : 'eligible'}`,
      );
    }
  }
  const runs = planRuns(tasks, catalog.releases, out ?? '<out>');
  const lint = [...new Set(runs.flatMap((r) => isolationProblems(r.command)))];
  console.log(
    `${runs.length} planned runs (${tasks.length} tasks × 2 agents × arms); isolation lint: ${lint.length ? lint.join('; ') : 'clean'}`,
  );
  if (out) {
    for (const r of runs)
      writeFixtures(
        tasks.find((t) => t.id === r.task)!,
        r,
      );
    writeFileSync(join(out, 'plan.json'), JSON.stringify(runs, null, 2) + '\n');
    console.log(
      `Wrote fixtures and plan.json to ${out}. No skill content was placed and no agent was run.`,
    );
  }
  if (args.includes('--live')) {
    console.error('Live runs are not started by ES23 tooling; see the blockers above.');
    process.exit(2);
  }
}
