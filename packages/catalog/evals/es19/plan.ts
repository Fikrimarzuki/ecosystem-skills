import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../../src/consumers.ts';
import { TASKS, taskProblems, type Task } from './tasks.ts';

/*
 * ES19 evaluation planner. It builds identical, disposable fixture workspaces for each arm and writes the exact
 * prompts and criteria to plan.json. It never runs an agent and never places a skill's content in a workspace.
 *
 * Live runs are gated: a candidate must be approved (or have an approved release), and the owner must authorize the
 * run. ES19 did not run any agent; see docs/library.md (Evaluation) for why and how a live run would be done.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const args = process.argv.slice(2);
const val = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const skill = val('--skill');
const out = val('--out');

export function liveGate(skillId: string): string | undefined {
  const { catalog } = loadRegistry(root);
  const s = catalog.skills.find((x) => x.id === skillId);
  if (!s) return `unknown skill ${skillId}`;
  const approvedRelease = catalog.releases.some(
    (r) => r.skill === skillId && r.approval.status === 'approved',
  );
  if (s.review.status !== 'approved' && !approvedRelease)
    return `${skillId} is ${s.review.status}: its instructions have not been reviewed and approved, so it is not run by an agent`;
  if (s.discovery?.approvalBlockers.length) return `${skillId} has unresolved approval blockers`;
  return undefined;
}

function build(task: Task, base: string) {
  for (const arm of [
    'fixture',
    'A-baseline',
    'B-candidate',
    ...(task.alternative ? ['C-alternative'] : []),
  ]) {
    for (const [f, body] of Object.entries(task.files)) {
      const p = join(base, task.id, arm, f);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, body);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const problems = TASKS.flatMap(taskProblems);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const tasks = skill ? TASKS.filter((t) => t.skills.includes(skill)) : TASKS;
  if (!tasks.length) {
    console.error(`no ES19 task covers ${skill}`);
    process.exit(2);
  }
  if (args.includes('--live')) {
    console.error('Live agent runs are not performed by ES19. Gate for this request:');
    for (const s of skill ? [skill] : [...new Set(tasks.flatMap((t) => t.skills))])
      console.error(
        `  ${s}: ${liveGate(s) ?? 'eligible, but a live run still needs explicit owner authorization and an isolated environment'}`,
      );
    process.exit(2);
  }
  const plan = tasks.map((t) => ({
    task: t.id,
    skills: t.skills,
    alternative: t.alternative ?? null,
    arms: ['A-baseline', 'B-candidate', ...(t.alternative ? ['C-alternative'] : [])],
    prompt: t.prompt,
    criteria: t.criteria.map((c) => ({
      criterion: c.criterion,
      method: c.method,
      rubric: c.rubric,
    })),
  }));
  if (out) {
    for (const t of tasks) build(t, resolve(out));
    writeFileSync(join(resolve(out), 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
    console.log(
      `Wrote ${tasks.length} task(s) with fixture workspaces per arm to ${out} (no skill content placed, no agent run).`,
    );
  } else console.log(JSON.stringify(plan, null, 2));
}
