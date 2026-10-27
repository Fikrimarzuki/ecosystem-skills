// Usage: tsx evals/report.ts --out <scratch dir> [--write]
// Aggregates per-run summaries into a matrix and (with --write) into registry/evidence.json (es8-* records only).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoveryResult, tally } from './analyze.ts';
import { SCENARIOS } from './scenarios.ts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const out = argv[argv.indexOf('--out') + 1]!;
const write = argv.includes('--write');
const date = argv.includes('--date')
  ? argv[argv.indexOf('--date') + 1]!
  : new Date().toISOString().slice(0, 10);

/* Registry rows are read as loosely-typed JSON here; the registry schema validates them afterwards. */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface Summary {
  id: string;
  agent: 'claude-code' | 'codex';
  agentVersion: string;
  scenario: string;
  skill: string;
  fixture: string;
  condition: 'treatment' | 'control';
  rep: number;
  invoked: string;
  behavior: string;
  discoveredByAgent?: boolean;
  testRuns: number;
  changedFiles: string[];
  testsPass?: boolean;
  contaminated: boolean;
  failed?: string;
  questions: number;
}
const dir = join(out, 'summaries');
const all: Summary[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

const skills = JSON.parse(readFileSync(join(repo, 'registry/skills.json'), 'utf8')) as any[];
const agents = [...new Set(all.map((s) => s.agent))];
const records: any[] = [];
const matrix: string[] = [];

for (const agent of agents) {
  for (const sk of ['grilling', 'verification-before-completion']) {
    const skill = skills.find((s) => s.id === sk);
    const rows = all.filter((s) => s.agent === agent && s.skill === sk);
    const t = rows.filter((r) => r.condition === 'treatment');
    const c = rows.filter((r) => r.condition === 'control');
    const tt = tally(
      t.map((r) => ({ invoked: r.invoked as any, behavior: r.behavior as any })),
      true,
    );
    const ct = tally(
      c.map((r) => ({ behavior: r.behavior as any })),
      false,
    );
    matrix.push(
      `${agent.padEnd(11)} ${sk.padEnd(32)} treatment runs ${tt.runs} | invoked ${tt.invoked} | behavior pass ${tt.passed}, partial ${tt.partial}, fail ${tt.failed}, inconclusive ${tt.inconclusive} || control runs ${ct.runs} | pass ${ct.passed}, partial ${ct.partial}, fail ${ct.failed}, inconclusive ${ct.inconclusive}${c.some((r) => r.contaminated) ? ' CONTAMINATED' : ''}`,
    );
    for (const sc of SCENARIOS.filter((x) => x.skill === sk)) {
      const st = t.filter((r) => r.scenario === sc.id);
      const sc2 = c.filter((r) => r.scenario === sc.id);
      if (!st.length) continue;
      const a = tally(
        st.map((r) => ({ invoked: r.invoked as any, behavior: r.behavior as any })),
        true,
      );
      const b = tally(
        sc2.map((r) => ({ behavior: r.behavior as any })),
        false,
      );
      const complete = a.inconclusive === 0;
      const allInvoked = a.invoked === a.runs;
      const discovery = discoveryResult(agent, st);
      const cmd = st.some((r) => r.testRuns > 0)
        ? `Agents ran tests in ${st.filter((r) => r.testRuns > 0).length}/${st.length} treatment runs and ${sc2.filter((r) => r.testRuns > 0).length}/${sc2.length} control runs.`
        : 'No test commands were run by the agent in any run.';
      records.push({
        id: `es8-${sk}-${agent}-${sc.id.toLowerCase()}`,
        skill: sk,
        agent,
        agentVersion: st[0]!.agentVersion,
        date,
        context:
          'ES8 evaluation: disposable fixture workspace with project-local relative symlinks (treatment) versus the same fixture without the skill (control), macOS arm64',
        revision: skill.source.revision,
        contentHash: skill.review.contentHash,
        task: sc.prompt,
        trigger: 'natural',
        scenario: sc.id.toLowerCase(),
        fixture: sc.fixture,
        discovery,
        instructions: a.invoked! > 0 ? 'pass' : 'not-tested',
        invocation: allInvoked ? 'pass' : 'fail',
        result:
          discovery === 'fail'
            ? 'failed'
            : complete && allInvoked && a.passed === a.runs
              ? 'verified'
              : 'partial',
        trials: {
          treatment: {
            runs: a.runs,
            invoked: a.invoked,
            passed: a.passed,
            partial: a.partial,
            failed: a.failed,
            inconclusive: a.inconclusive,
          },
          ...(b.runs
            ? {
                control: {
                  runs: b.runs,
                  passed: b.passed,
                  partial: b.partial,
                  failed: b.failed,
                  inconclusive: b.inconclusive,
                },
              }
            : {}),
        },
        environment: `Fresh session per run; each workspace is its own git repo with no skill directories in any parent; the skill was linked only for the treatment condition. Treatment links only the tested skill. Same fixture, prompt, tool permissions and agent version for both conditions. ${agent === 'codex' ? 'Codex ran sequentially from a normal terminal inside its own sandbox (read-only; workspace-write for the fix scenario V1).' : 'Claude Code ran with a narrow tool allow-list.'}`,
        commands: cmd,
        notes: `Invocation is counted from load evidence in the agent trace only (${agent === 'claude-code' ? 'Skill tool call or SKILL.md read' : 'SKILL.md read'}); behavior is judged by a coarse rubric and is independent of invocation. Natural triggering is probabilistic; ${a.runs} treatment run(s) is a small sample.${b.runs && b.passed >= a.passed ? ' Controls passed at least as often, so no behavioral improvement from the skill is established.' : ''}${agent === 'codex' && discovery === 'not-tested' ? ' Codex traces do not list available skills, so discovery is not demonstrated by these runs (see the explicit-invocation record).' : ''}`,
      });
    }
  }
}
console.log(matrix.join('\n'));
console.log(
  `total runs: ${all.length} (${all.filter((r) => r.condition === 'treatment').length} treatment, ${all.filter((r) => r.condition === 'control').length} control)`,
);

if (write) {
  const file = join(repo, 'registry/evidence.json');
  const existing = JSON.parse(readFileSync(file, 'utf8')) as any[];
  const merged = [
    ...existing.filter(
      (e) => !String(e.id).startsWith('es8-') || !records.some((r) => r.id === e.id),
    ),
    ...records,
  ];
  writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
  const res = join(repo, 'packages/catalog/evals/results');
  mkdirSync(res, { recursive: true });
  for (const agent of agents) {
    const slim = all
      .filter((s) => s.agent === agent)
      .map(
        ({
          id,
          scenario,
          skill,
          fixture,
          condition,
          rep,
          agentVersion,
          invoked,
          behavior,
          discoveredByAgent,
          testRuns,
          changedFiles,
          testsPass,
          contaminated,
          failed,
          questions,
        }) => ({
          id,
          scenario,
          skill,
          fixture,
          condition,
          rep,
          agentVersion,
          invoked,
          behavior,
          discoveredByAgent,
          testRuns,
          changedFiles,
          testsPass,
          contaminated,
          failed,
          questions,
        }),
      );
    writeFileSync(join(res, `es8-${agent}.json`), JSON.stringify(slim, null, 2) + '\n');
  }
  console.log(`wrote ${records.length} evidence record(s) and per-run results`);
}
