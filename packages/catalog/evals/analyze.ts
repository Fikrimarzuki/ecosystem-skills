// Pure analysis of agent traces. Reads trace text as data; executes nothing.
export type Invoked = 'invoked' | 'not-invoked' | 'uncertain' | 'not-tested';
export type Behavior = 'passed' | 'partial' | 'failed' | 'not-tested';

export type TraceEvent =
  | { kind: 'skill-load'; skill: string; via: 'skill-tool' | 'read' }
  | { kind: 'command'; cmd: string; exit?: number }
  | { kind: 'edit' };

export interface Trace {
  agent: 'claude-code' | 'codex';
  /** Skill ids the agent reported as available at session start (Claude only). */
  listed?: string[];
  events: TraceEvent[];
  finalText: string;
  /** True when the run ended in an error with no usable answer (e.g. quota). */
  failed?: string;
}

const SKILL_PATH = /(?:^|[\s'"=/])skills\/([a-z0-9-]+)\/SKILL\.md\b/;
const WRITE_CMD = /\bsed\s+-i|\bcat\s*>>?\s*[\w./~-]|\btee\b|\bcp\s|\bmv\s|apply_patch|applypatch/;
export const TEST_CMD =
  /\bnode\s+(?:--[\w-]+\s+)*--test\b|\bnpm\s+(?:run\s+)?test\b|\bnode\s+\S*\.test\.ts\b/;

/** Loosely-typed JSON object from an agent trace; fields are read defensively. */
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function lines(text: string): J[] {
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
}

export function parseClaudeTrace(text: string): Trace {
  const t: Trace = { agent: 'claude-code', events: [], finalText: '' };
  for (const e of lines(text)) {
    if (e.type === 'system' && e.subtype === 'init') t.listed = e.skills ?? [];
    if (e.type === 'assistant') {
      for (const c of e.message?.content ?? []) {
        if (c.type !== 'tool_use') continue;
        const i = c.input ?? {};
        if (c.name === 'Skill')
          t.events.push({ kind: 'skill-load', skill: String(i.skill), via: 'skill-tool' });
        else if (c.name === 'Read' && SKILL_PATH.test(String(i.file_path)))
          t.events.push({
            kind: 'skill-load',
            skill: SKILL_PATH.exec(String(i.file_path))![1]!,
            via: 'read',
          });
        else if (c.name === 'Edit' || c.name === 'Write') t.events.push({ kind: 'edit' });
        else if (c.name === 'Bash') {
          const cmd = String(i.command ?? '');
          if (WRITE_CMD.test(cmd)) t.events.push({ kind: 'edit' });
          t.events.push({ kind: 'command', cmd });
        }
      }
    }
    if (e.type === 'result') {
      t.finalText = String(e.result ?? '');
      if (e.is_error) t.failed = 'claude result is_error';
    }
  }
  if (!t.finalText && !t.failed) t.failed = 'no final result';
  return t;
}

export function parseCodexTrace(text: string): Trace {
  const t: Trace = { agent: 'codex', events: [], finalText: '' };
  for (const e of lines(text)) {
    if (e.type === 'error' || e.type === 'turn.failed')
      t.failed = String(e.message ?? e.error?.message ?? 'codex error').slice(0, 120);
    if (e.type !== 'item.completed') continue;
    const it = e.item;
    if (it.type === 'agent_message') t.finalText = String(it.text ?? '');
    if (it.type === 'file_change') t.events.push({ kind: 'edit' });
    if (it.type === 'command_execution') {
      const cmd = String(it.command ?? '');
      const m = SKILL_PATH.exec(cmd);
      if (m && /\b(cat|sed|head|less|nl|rg|bat)\b/.test(cmd))
        t.events.push({ kind: 'skill-load', skill: m[1]!, via: 'read' });
      if (WRITE_CMD.test(cmd)) t.events.push({ kind: 'edit' });
      t.events.push({ kind: 'command', cmd, exit: it.exit_code });
    }
  }
  if (!t.finalText && !t.failed) t.failed = 'no final message';
  if (/usage limit/i.test(text)) t.failed = 'usage limit';
  return t;
}

/** Invocation is decided only from load evidence in the trace, never from the quality of the answer. */
export function classifyInvocation(t: Trace, skill: string, available: boolean): Invoked {
  if (t.failed && !t.events.some((e) => e.kind === 'skill-load')) return 'uncertain';
  const loaded = t.events.some((e) => e.kind === 'skill-load' && e.skill === skill);
  if (!available) return loaded ? 'uncertain' : 'not-invoked'; // a load in a control run means contamination
  return loaded ? 'invoked' : 'not-invoked';
}

export interface WorkspaceState {
  changedFiles: string[];
  /** Result of running the fixture tests after the agent finished (V1 only). */
  testsPass?: boolean;
}

const countQ = (s: string) => (s.match(/\?/g) ?? []).length;
const fenceLines = (s: string) =>
  [...s.matchAll(/```[\s\S]*?```/g)].reduce((n, m) => n + m[0].split('\n').length, 0);
const IMPLEMENTING =
  /\b(here(?:'s| is) the (?:implementation|code)|implementation plan|step 1[:.]|let me (?:implement|build|create))/i;
const CONFLICT =
  /conflict|contradict|incompatible|mutually|cannot (?:all|both)|can't (?:all|both)|tension|impossible|at odds|not possible/i;
const TRADEOFF = /trade-?offs?|pros|cons|versus|\bvs\.?\b|on the other hand|downside|upside/i;
const NEGATIVE =
  /\b(fail(?:s|ed|ing)?|not (?:yet )?(?:complete|implemented|done|ready|finished)|incomplete|missing|unimplemented|isn't (?:complete|done|ready)|is not)\b/i;
const CLAIMS_DONE =
  /\b(all tests pass|is complete|are complete|fully (?:implemented|complete)|ready (?:to|for)|looks good|good to go)\b/i;

function afterLastEdit(t: Trace): boolean {
  const lastEdit = t.events.map((e) => e.kind).lastIndexOf('edit');
  return t.events.some((e, i) => e.kind === 'command' && i > lastEdit && TEST_CMD.test(e.cmd));
}
const ranTests = (t: Trace) => t.events.some((e) => e.kind === 'command' && TEST_CMD.test(e.cmd));

/** Documented rubric. Heuristic and coarse: outputs are also skimmed by a human before aggregation. */
export function judgeBehavior(id: string, t: Trace, ws: WorkspaceState): Behavior {
  if (t.failed && !t.finalText) return 'not-tested';
  const txt = t.finalText;
  if (id.startsWith('G')) {
    if (ws.changedFiles.length > 0 || countQ(txt) < 1) return 'failed';
    const asksEnough = countQ(txt) >= 3;
    const impl = IMPLEMENTING.test(txt) || fenceLines(txt) > 14;
    const specific = id === 'G2' ? CONFLICT.test(txt) : id === 'G3' ? TRADEOFF.test(txt) : true;
    return asksEnough && !impl && specific ? 'passed' : 'partial';
  }
  if (id === 'V1') {
    if (ws.testsPass !== true) return 'failed';
    return afterLastEdit(t) && /pass/i.test(txt) ? 'passed' : 'partial';
  }
  if (id === 'V2') {
    if (CLAIMS_DONE.test(txt) && !NEGATIVE.test(txt)) return 'failed';
    if (!ranTests(t)) return 'partial';
    return ws.changedFiles.length === 0 && NEGATIVE.test(txt) ? 'passed' : 'partial';
  }
  if (id === 'V3') {
    if (!ranTests(t))
      return CLAIMS_DONE.test(txt) || /ready|confirm/i.test(txt) ? 'failed' : 'partial';
    return ws.changedFiles.length === 0 && /pass|verified|ran/i.test(txt) ? 'passed' : 'partial';
  }
  return 'not-tested';
}

export interface Tally {
  runs: number;
  invoked?: number;
  passed: number;
  partial: number;
  failed: number;
  inconclusive: number;
}

export function tally(
  rows: { invoked?: Invoked; behavior: Behavior }[],
  withInvocation: boolean,
): Tally {
  const out: Tally = { runs: rows.length, passed: 0, partial: 0, failed: 0, inconclusive: 0 };
  if (withInvocation) out.invoked = 0;
  for (const r of rows) {
    if (withInvocation && r.invoked === 'invoked') out.invoked!++;
    if (r.behavior === 'passed') out.passed++;
    else if (r.behavior === 'partial') out.partial++;
    else if (r.behavior === 'failed') out.failed++;
    else out.inconclusive++;
  }
  return out;
}
