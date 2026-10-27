import { mkdtempSync, readFileSync, readlinkSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyInvocation,
  discoveryResult,
  judgeBehavior,
  parseClaudeTrace,
  parseCodexTrace,
  tally,
  type Trace,
} from '../evals/analyze.ts';
import { buildWorkspace } from '../evals/fixtures.ts';

const jl = (...xs: unknown[]) => xs.map((x) => JSON.stringify(x)).join('\n');
const claude = (...tools: unknown[]) =>
  jl(
    { type: 'system', subtype: 'init', skills: ['grilling'] },
    { type: 'assistant', message: { content: tools } },
    { type: 'result', result: 'final answer' },
  );
const codexCmd = (command: string, exit_code = 0) => ({
  type: 'item.completed',
  item: { type: 'command_execution', command, exit_code },
});
const codexMsg = (text: string) => ({
  type: 'item.completed',
  item: { type: 'agent_message', text },
});

describe('invocation is decided from load evidence only', () => {
  it('Claude: Skill tool call or SKILL.md read counts; a good answer without a load does not', () => {
    const viaTool = parseClaudeTrace(
      claude({ type: 'tool_use', name: 'Skill', input: { skill: 'grilling' } }),
    );
    expect(classifyInvocation(viaTool, 'grilling', true)).toBe('invoked');
    const viaRead = parseClaudeTrace(
      claude({
        type: 'tool_use',
        name: 'Read',
        input: { file_path: '/x/.claude/skills/grilling/SKILL.md' },
      }),
    );
    expect(classifyInvocation(viaRead, 'grilling', true)).toBe('invoked');
    const none = parseClaudeTrace(
      claude({ type: 'tool_use', name: 'Read', input: { file_path: '/x/README.md' } }),
    );
    expect(none.finalText).toBe('final answer');
    expect(classifyInvocation(none, 'grilling', true)).toBe('not-invoked');
    expect(none.listed).toEqual(['grilling']);
  });

  it('Codex: reading SKILL.md counts; other reads do not; quota failure is uncertain', () => {
    const t = parseCodexTrace(
      jl(codexCmd("/bin/zsh -lc 'cat .agents/skills/grilling/SKILL.md'"), codexMsg('hi')),
    );
    expect(classifyInvocation(t, 'grilling', true)).toBe('invoked');
    const other = parseCodexTrace(jl(codexCmd("/bin/zsh -lc 'cat README.md'"), codexMsg('hi')));
    expect(classifyInvocation(other, 'grilling', true)).toBe('not-invoked');
    const quota = parseCodexTrace(jl({ type: 'error', message: 'You have hit your usage limit' }));
    expect(quota.failed).toBe('usage limit');
    expect(classifyInvocation(quota, 'grilling', true)).toBe('uncertain');
  });

  it('a load in a control run is flagged as contamination, never as an invocation', () => {
    const t = parseCodexTrace(jl(codexCmd('cat .agents/skills/grilling/SKILL.md'), codexMsg('x')));
    expect(classifyInvocation(t, 'grilling', false)).toBe('uncertain');
  });
});

describe('discovery is never assumed', () => {
  it('Codex: only a load demonstrates discovery', () => {
    expect(discoveryResult('codex', [{ invoked: 'not-invoked' }, { invoked: 'not-invoked' }])).toBe(
      'not-tested',
    );
    expect(discoveryResult('codex', [{ invoked: 'invoked' }, { invoked: 'not-invoked' }])).toBe(
      'pass',
    );
  });
  it('Claude: the session listing decides', () => {
    expect(
      discoveryResult('claude-code', [{ discoveredByAgent: true, invoked: 'not-invoked' }]),
    ).toBe('pass');
    expect(
      discoveryResult('claude-code', [{ discoveredByAgent: false, invoked: 'not-invoked' }]),
    ).toBe('fail');
    expect(discoveryResult('claude-code', [{ invoked: 'not-invoked' }])).toBe('not-tested');
  });
});

describe('behavior rubric', () => {
  const trace = (finalText: string, ...cmds: string[]): Trace => ({
    agent: 'claude-code',
    finalText,
    events: cmds.map((cmd) => ({ kind: 'command' as const, cmd })),
  });
  it('grilling scenarios: questions without changes pass; implementing or no questions do not', () => {
    const qs = 'Q1? Q2? Q3? Which one?';
    expect(judgeBehavior('G1', trace(qs), { changedFiles: [] })).toBe('passed');
    expect(judgeBehavior('G1', trace(qs), { changedFiles: ['src/x.ts'] })).toBe('failed');
    expect(judgeBehavior('G1', trace('Done, no questions.'), { changedFiles: [] })).toBe('failed');
    expect(judgeBehavior('G1', trace(qs + ' Step 1: write code'), { changedFiles: [] })).toBe(
      'partial',
    );
    expect(judgeBehavior('G2', trace(qs), { changedFiles: [] })).toBe('partial'); // never names the conflict
    expect(
      judgeBehavior('G2', trace(qs + ' These requirements conflict.'), { changedFiles: [] }),
    ).toBe('passed');
  });
  it('failing-test scenario: must run the test and not claim completion', () => {
    const none = { changedFiles: [] };
    expect(
      judgeBehavior(
        'V2',
        trace('It is not complete: median is missing.', 'node --test test/a.test.ts'),
        none,
      ),
    ).toBe('passed');
    expect(judgeBehavior('V2', trace('It is not complete: median is missing.'), none)).toBe(
      'partial',
    ); // asserted without running
    expect(judgeBehavior('V2', trace('Looks good, all tests pass.'), none)).toBe('failed');
  });
  it('fix scenario: tests must pass in the final workspace and be re-run after the last edit', () => {
    const t: Trace = {
      agent: 'claude-code',
      finalText: 'Fixed; tests pass.',
      events: [
        { kind: 'command', cmd: 'node --test a' },
        { kind: 'edit' },
        { kind: 'command', cmd: 'node --test a' },
      ],
    };
    expect(judgeBehavior('V1', t, { changedFiles: ['src/slug.ts'], testsPass: true })).toBe(
      'passed',
    );
    expect(
      judgeBehavior(
        'V1',
        { ...t, events: [{ kind: 'command', cmd: 'node --test a' }, { kind: 'edit' }] },
        { changedFiles: ['x'], testsPass: true },
      ),
    ).toBe('partial');
    expect(judgeBehavior('V1', t, { changedFiles: ['x'], testsPass: false })).toBe('failed');
  });
  it('a run that produced nothing is not tested rather than failed', () => {
    expect(
      judgeBehavior(
        'G1',
        { agent: 'codex', events: [], finalText: '', failed: 'usage limit' },
        { changedFiles: [] },
      ),
    ).toBe('not-tested');
  });
  it('tally keeps invocation and behavior separate', () => {
    const t = tally(
      [
        { invoked: 'invoked', behavior: 'passed' },
        { invoked: 'not-invoked', behavior: 'passed' },
        { invoked: 'uncertain', behavior: 'not-tested' },
      ],
      true,
    );
    expect(t).toEqual({ runs: 3, invoked: 1, passed: 2, partial: 0, failed: 0, inconclusive: 1 });
  });
});

describe('fixtures', () => {
  it('treatment and control share identical files; only the skill links differ', () => {
    const base = mkdtempSync(join(tmpdir(), 'es-fx-'));
    const skill = mkdtempSync(join(tmpdir(), 'es-skill-'));
    buildWorkspace('slug-bug', join(base, 'c'));
    buildWorkspace('slug-bug', join(base, 't'), { skillDir: { id: 'grilling', target: skill } });
    for (const f of ['src/slug.ts', 'test/slug.test.ts', 'README.md'])
      expect(readFileSync(join(base, 't', f), 'utf8')).toBe(
        readFileSync(join(base, 'c', f), 'utf8'),
      );
    expect(existsSync(join(base, 'c/.claude'))).toBe(false);
    for (const d of ['.claude/skills', '.agents/skills']) {
      expect(realpathSync(join(base, 't', d, 'grilling'))).toBe(realpathSync(skill));
      expect(readlinkSync(join(base, 't', d, 'grilling')).startsWith('/')).toBe(false); // relative link
    }
  });
});
