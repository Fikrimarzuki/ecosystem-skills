// Usage: tsx evals/run.ts --agent claude-code|codex --out <scratch dir> [--scenarios G1,V2] [--reps 1] [--conditions treatment,control] [--concurrency 2]
// Raw traces and workspaces stay under --out (outside the repo). Per-run summaries contain no paths or logs.
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkspace } from './fixtures.ts';
import {
  classifyInvocation,
  judgeBehavior,
  parseClaudeTrace,
  parseCodexTrace,
  type Behavior,
  type Invoked,
  type Trace,
} from './analyze.ts';
import { SCENARIOS, type Scenario } from './scenarios.ts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const opt = (n: string, d?: string) =>
  argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d;

const agent = opt('agent') as 'claude-code' | 'codex';
const out = opt('out');
if ((agent !== 'claude-code' && agent !== 'codex') || !out) {
  console.error(
    'usage: run.ts --agent claude-code|codex --out <dir> [--scenarios G1,..] [--reps n] [--conditions treatment,control] [--concurrency n]',
  );
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const OUT = realpathSync(out);
const reps = Number(opt('reps', '1'));
const conditions = (opt('conditions', 'treatment,control') as string).split(',') as (
  'treatment' | 'control'
)[];
const wanted = (opt('scenarios') ?? SCENARIOS.map((s) => s.id).join(',')).split(',');
const concurrency = agent === 'codex' ? 1 : Number(opt('concurrency', '2')); // Codex: never parallel

const CLAUDE = (() => {
  const base = join(homedir(), '.vscode/extensions');
  const dir = readdirSync(base)
    .filter((d) => d.startsWith('anthropic.claude-code-') && d.includes('darwin-arm64'))
    .sort()
    .at(-1);
  return dir ? join(base, dir, 'resources/native-binary/claude') : 'claude';
})();

const version = execFileSync(agent === 'codex' ? 'codex' : CLAUDE, ['--version'], {
  encoding: 'utf8',
})
  .trim()
  .match(/[\d.]+/)![0]!;

/** Entries of Codex's bundled skills folder, to detect incomplete bundles. Read-only. */
function codexSystemSnapshot(): { entries: string[]; incomplete: string[] } {
  const dir = join(homedir(), '.codex/skills/.system');
  const entries = existsSync(dir)
    ? readdirSync(dir)
        .filter((n) => !n.startsWith('.'))
        .sort()
    : [];
  const incomplete = entries.filter((n) => !existsSync(join(dir, n, 'SKILL.md')));
  return { entries, incomplete };
}

function assertIsolated(ws: string, treatment: boolean) {
  // No ancestor directory may expose skills; global dirs must not hold the tested skills.
  for (let d = dirname(ws); d !== dirname(d); d = dirname(d))
    for (const s of ['.claude/skills', '.agents/skills'])
      if (existsSync(join(d, s))) throw new Error(`isolation: ancestor ${d} has ${s}`);
  for (const g of [join(homedir(), '.claude/skills'), join(homedir(), '.agents/skills')])
    if (
      existsSync(g) &&
      readdirSync(g).some((n) => ['grilling', 'verification-before-completion'].includes(n))
    )
      throw new Error(`isolation: global skills dir ${g} contains a tested skill`);
  if (!treatment && (existsSync(join(ws, '.claude')) || existsSync(join(ws, '.agents'))))
    throw new Error('control has skill dirs');
}

function claudeArgs(s: Scenario): string[] {
  const read = ['Read', 'Glob', 'Grep'];
  const node = 'Bash(node *)';
  const allow = s.mayEdit
    ? [...read, 'Edit', 'Write', node]
    : s.skill === 'grilling'
      ? read
      : [...read, node];
  const deny = s.mayEdit
    ? []
    : s.skill === 'grilling'
      ? ['Bash', 'Edit', 'Write']
      : ['Edit', 'Write'];
  return ['--allowedTools', ...allow, ...(deny.length ? ['--disallowedTools', ...deny] : [])];
}

function runProcess(cmd: string, args: string[], cwd: string, outFile: string): Promise<number> {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', () => undefined);
    p.on('close', (code) => {
      writeFileSync(outFile, Buffer.concat(chunks));
      res(code ?? 1);
    });
  });
}

interface Job {
  s: Scenario;
  cond: 'treatment' | 'control';
  rep: number;
}
const jobs: Job[] = [];
for (const s of SCENARIOS.filter((x) => wanted.includes(x.id)))
  for (let rep = 1; rep <= reps; rep++) for (const cond of conditions) jobs.push({ s, cond, rep });

async function runJob({ s, cond, rep }: Job) {
  const id = `${agent}-${s.id}-${cond}-${rep}`;
  const summaryFile = join(OUT, 'summaries', `${id}.json`);
  if (existsSync(summaryFile)) return console.log(`skip ${id} (done)`);
  const ws = join(OUT, 'work', id);
  rmSync(ws, { recursive: true, force: true });
  const treatment = cond === 'treatment';
  buildWorkspace(
    s.fixture,
    ws,
    treatment ? { skillDir: { id: s.skill, target: join(repo, 'external/skills', s.skill) } } : {},
  );
  assertIsolated(realpathSync(ws), treatment);
  const before = agent === 'codex' ? codexSystemSnapshot() : undefined;
  if (agent === 'codex' && before!.incomplete.length)
    throw new Error(`Codex bundled skills incomplete before run: ${before!.incomplete}`);
  mkdirSync(join(OUT, 'raw'), { recursive: true });
  const raw = join(OUT, 'raw', `${id}.jsonl`);
  const code =
    agent === 'claude-code'
      ? await runProcess(
          CLAUDE,
          [
            '-p',
            s.prompt,
            '--output-format',
            'stream-json',
            '--verbose',
            '--model',
            'sonnet',
            ...claudeArgs(s),
          ],
          ws,
          raw,
        )
      : await runProcess(
          'codex',
          [
            'exec',
            '-s',
            s.mayEdit ? 'workspace-write' : 'read-only',
            '--ephemeral',
            '--json',
            s.prompt,
          ],
          ws,
          raw,
        );
  const trace: Trace = (agent === 'claude-code' ? parseClaudeTrace : parseCodexTrace)(
    readFileSync(raw, 'utf8'),
  );
  const changed = execFileSync('git', ['status', '--porcelain'], { cwd: ws, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3));
  let testsPass: boolean | undefined;
  if (s.id === 'V1') {
    try {
      execFileSync('node', ['--test', 'test/slug.test.ts'], {
        cwd: ws,
        stdio: 'ignore',
        timeout: 60000,
      });
      testsPass = true;
    } catch {
      testsPass = false;
    }
  }
  const invoked: Invoked = classifyInvocation(trace, s.skill, treatment);
  const behavior: Behavior = judgeBehavior(s.id, trace, { changedFiles: changed, testsPass });
  const after = agent === 'codex' ? codexSystemSnapshot() : undefined;
  if (after?.incomplete.length)
    console.error(
      `!! Codex bundled skills incomplete after ${id}: ${after.incomplete}. Stopping; not repairing.`,
    );
  const summary = {
    id,
    agent,
    agentVersion: version,
    scenario: s.id,
    skill: s.skill,
    fixture: s.fixture,
    condition: cond,
    rep,
    exitCode: code,
    discoveredByAgent: trace.listed ? trace.listed.includes(s.skill) : undefined,
    loadedSkills: [
      ...new Set(
        trace.events.flatMap((e) => (e.kind === 'skill-load' ? [`${e.skill}:${e.via}`] : [])),
      ),
    ],
    invoked,
    behavior,
    failed: trace.failed,
    testRuns: trace.events.filter((e) => e.kind === 'command' && /test/.test(e.cmd)).length,
    changedFiles: changed,
    testsPass,
    questions: (trace.finalText.match(/\?/g) ?? []).length,
    contaminated:
      !treatment && trace.events.some((e) => e.kind === 'skill-load' && e.skill === s.skill),
    codexSystemBefore: before?.entries,
    codexSystemAfter: after?.entries,
    finalExcerpt: trace.finalText.replace(/\s+/g, ' ').slice(0, 400),
  };
  mkdirSync(dirname(summaryFile), { recursive: true });
  writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');
  console.log(
    `${id}: invoked=${invoked} behavior=${behavior}${trace.failed ? ` (${trace.failed})` : ''}`,
  );
  if (after?.incomplete.length) process.exit(3);
  if (trace.failed === 'usage limit') {
    console.error('Codex/Claude usage limit reached; stopping further runs.');
    process.exit(4);
  }
}

if (agent === 'codex') {
  let running = '';
  try {
    running = execFileSync('pgrep', ['-fl', 'codex exec'], { encoding: 'utf8' }).trim();
  } catch {
    /* pgrep exits 1 when nothing matches */
  }
  if (running) throw new Error('another codex exec is running');
}
const queue = [...jobs];
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) await runJob(j);
  }),
);
