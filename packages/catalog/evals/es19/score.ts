import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanTree } from '../../src/tree.ts';
import type { Check, Criterion, Task } from './tasks.ts';

export type Result = 'pass' | 'fail' | 'manual' | 'not-measured';
export interface Score {
  criterion: Criterion;
  result: Result;
  detail: string;
}

const read = (dir: string, f: string) =>
  existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : undefined;

/** Files that differ between the untouched fixture and the agent's workspace (added, removed or changed). */
export function changedFiles(fixture: string, workspace: string): string[] {
  const a = new Map(scanTree(fixture).files.map((f) => [f.path, f.sha256]));
  const b = new Map(
    scanTree(workspace)
      .files.filter(
        (f) =>
          !f.path.startsWith('.claude/') &&
          !f.path.startsWith('.agents/') &&
          !f.path.startsWith('.git/'),
      )
      .map((f) => [f.path, f.sha256]),
  );
  const out = new Set<string>();
  for (const [p, h] of b) if (a.get(p) !== h) out.add(p);
  for (const p of a.keys()) if (!b.has(p)) out.add(p);
  return [...out].sort();
}

export function runCheck(
  c: Check,
  fixture: string,
  workspace: string,
): { ok: boolean; detail: string } {
  switch (c.kind) {
    case 'contains':
    case 'absent': {
      const text = read(workspace, c.file);
      if (text === undefined)
        return { ok: c.kind === 'absent', detail: `${c.file} does not exist` };
      const hit = new RegExp(c.pattern, c.flags ?? 'i').test(text);
      return {
        ok: c.kind === 'contains' ? hit : !hit,
        detail: `${c.kind} /${c.pattern}/ in ${c.file}: ${hit ? 'found' : 'not found'}`,
      };
    }
    case 'any': {
      const rs = c.checks.map((x) => runCheck(x, fixture, workspace));
      return { ok: rs.some((r) => r.ok), detail: rs.map((r) => r.detail).join(' | ') };
    }
    case 'only-changed': {
      const changed = changedFiles(fixture, workspace);
      const extra = changed.filter((f) => !c.allowed.includes(f));
      return {
        ok: extra.length === 0,
        detail: extra.length
          ? `unexpected changes: ${extra.join(', ')}`
          : `changed: ${changed.join(', ') || 'nothing'}`,
      };
    }
    case 'no-new-dependencies': {
      const before = JSON.parse(read(fixture, c.file) ?? '{}');
      const after = JSON.parse(read(workspace, c.file) ?? '{}');
      const deps = (j: Record<string, Record<string, string>>) =>
        Object.keys({ ...(j.dependencies ?? {}), ...(j.devDependencies ?? {}) });
      const added = deps(after).filter((d) => !deps(before).includes(d) && !c.allowed.includes(d));
      return {
        ok: added.length === 0,
        detail: added.length
          ? `new dependencies: ${added.join(', ')}`
          : 'no unexpected dependencies',
      };
    }
  }
}

/** Score one arm's workspace against the untouched fixture. Manual and trace criteria are never auto-scored. */
export function scoreWorkspace(task: Task, fixture: string, workspace: string): Score[] {
  return task.criteria.map((c) => {
    if (c.method === 'manual')
      return { criterion: c.criterion, result: 'manual', detail: c.rubric };
    if (c.method === 'trace')
      return { criterion: c.criterion, result: 'not-measured', detail: 'requires an agent trace' };
    const r = runCheck(c.check!, fixture, workspace);
    return { criterion: c.criterion, result: r.ok ? 'pass' : 'fail', detail: r.detail };
  });
}
