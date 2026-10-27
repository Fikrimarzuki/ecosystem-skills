import { randomBytes } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { layout, readLock } from './install.ts';
import {
  assertSkillId,
  ConsumerError,
  inspectAgentDir,
  isInside,
  kindOf,
  linkDestination,
  realOrUndefined,
} from './fsguard.ts';
import { PROJECT_SKILL_DIRS } from './links.ts';
import type { Agent, Catalog, Consumer, Skill } from './schema.ts';
import { scanTree } from './tree.ts';
import { assignmentPolicy } from './consumers.ts';

/** Where a skill's canonical content lives in this repository, and whether it is safe to expose. */
export interface Canonical {
  skill: Skill;
  path?: string;
  /** Expected content hash (copy mode and integrity checks). */
  hash?: string;
  problems: string[];
}

/** Areas of this repository whose links are "owned" by Ecosystem Skills. */
export function managedRoots(repoRoot: string): string[] {
  const real = realOrUndefined(repoRoot) ?? resolve(repoRoot);
  return [join(real, 'external', 'skills'), join(real, 'skills')];
}

export function resolveCanonical(repoRoot: string, skill: Skill): Canonical {
  const problems: string[] = [];
  const repoReal = realOrUndefined(repoRoot) ?? resolve(repoRoot);
  const policy = assignmentPolicy(skill);
  if (policy) problems.push(policy);
  if (skill.source.type === 'first-party') {
    const p = realOrUndefined(resolve(repoReal, skill.source.path));
    if (!p)
      return {
        skill,
        problems: [...problems, `first-party source ${skill.source.path} is missing`],
      };
    if (!isInside(join(repoReal, 'skills'), p))
      return {
        skill,
        problems: [
          ...problems,
          `first-party source resolves outside skills/ (${skill.source.path})`,
        ],
      };
    if (kindOf(join(p, 'SKILL.md')) !== 'file') problems.push(`first-party source has no SKILL.md`);
    const scan = scanTree(p);
    if (scan.special.length)
      problems.push(`first-party source contains symlinks: ${scan.special.join(', ')}`);
    return { skill, path: p, hash: scan.hash, problems };
  }
  const p = realOrUndefined(join(repoReal, 'external', 'skills', skill.id));
  if (!p)
    return {
      skill,
      problems: [...problems, `not installed (run pnpm skills:install ${skill.id})`],
    };
  if (!isInside(join(repoReal, 'external', 'skills'), p))
    return { skill, problems: [...problems, `install path resolves outside external/skills`] };
  const lock = readLock(layout(repoReal))[skill.id];
  const expected = skill.review.contentHash;
  if (!lock) problems.push(`install is not recorded in external/installed.json`);
  else if (lock.revision !== skill.source.revision)
    problems.push(
      `installed revision ${lock.revision.slice(0, 12)} is not the pinned ${skill.source.revision.slice(0, 12)}`,
    );
  const scan = scanTree(p);
  if (scan.special.length) problems.push(`install contains symlinks: ${scan.special.join(', ')}`);
  if (expected && scan.hash !== expected)
    problems.push(`installed content hash does not match the reviewed hash`);
  return { skill, path: p, hash: expected ?? scan.hash, problems };
}

export type ItemState =
  | 'ok'
  | 'missing'
  | 'broken'
  | 'wrong-target'
  | 'stale'
  | 'copy-modified'
  | 'mode-mismatch'
  | 'conflict'
  | 'unmanaged'
  | 'blocked';
export type Action =
  'none' | 'mkdir' | 'create-link' | 'repair-link' | 'create-copy' | 'prune-link';

export interface PlanItem {
  agent: Agent;
  /** Skill id, or the entry name for unexpected entries. */
  name: string;
  /** Path relative to the consumer root, for display. */
  rel: string;
  state: ItemState;
  action: Action;
  detail: string;
  assigned: boolean;
  /** Absolute paths, internal. */
  entry: string;
  canonical?: string;
  install?: 'symlink' | 'copy';
  hash?: string;
}

export interface SyncPlan {
  consumer: string;
  root: string;
  items: PlanItem[];
  /** mkdir steps for agent directories that do not exist yet. */
  dirs: string[];
  /** Items that stop the whole sync (nothing is written if any exist). */
  blockers: PlanItem[];
}

function isOwnedLink(repoRoot: string, entry: string): boolean {
  try {
    const dest = linkDestination(entry);
    const real = realOrUndefined(entry);
    return managedRoots(repoRoot).some(
      (m) => isInside(m, dest) || (real !== undefined && isInside(m, real)),
    );
  } catch {
    return false;
  }
}

/**
 * Compare a consumer's assignments with its project-local skill directories. Read-only. Decides, per agent
 * and skill, what (if anything) `applySync` may do. Anything not provably owned by Ecosystem Skills is a
 * conflict or reported as unmanaged and is never modified.
 */
export function planSync(
  repoRoot: string,
  catalog: Catalog,
  consumer: Consumer,
  projectRoot: string,
  { prune = false }: { prune?: boolean } = {},
): SyncPlan {
  if (consumer.kind === 'global')
    throw new ConsumerError(
      `"${consumer.id}" is a global consumer; global activation is out of scope`,
    );
  const items: PlanItem[] = [];
  const dirs: string[] = [];
  const canonCache = new Map<string, Canonical>();
  const canonical = (s: Skill) =>
    canonCache.get(s.id) ?? canonCache.set(s.id, resolveCanonical(repoRoot, s)).get(s.id)!;

  for (const [agent, relDir] of Object.entries(PROJECT_SKILL_DIRS) as [Agent, string][]) {
    const assigned = consumer.assignments.filter((a) => a.agents.includes(agent));
    const dir = inspectAgentDir(projectRoot, relDir);
    if (dir.toCreate.length && assigned.length)
      for (const d of dir.toCreate) if (!dirs.includes(d)) dirs.push(d);
    const base = (name: string) => ({
      agent,
      name,
      rel: `${relDir}/${name}`,
      entry: join(dir.path, name),
    });

    for (const a of assigned) {
      assertSkillId(a.skill);
      const skill = catalog.skills.find((s) => s.id === a.skill);
      const b = { ...base(a.skill), assigned: true, install: a.install };
      if (!skill) {
        items.push({
          ...b,
          state: 'blocked',
          action: 'none',
          detail: 'skill is not in the registry',
        });
        continue;
      }
      const c = canonical(skill);
      const kind = dir.toCreate.length ? 'missing' : kindOf(b.entry);
      const withC = { ...b, canonical: c.path, hash: c.hash };

      if (kind === 'symlink') {
        const real = realOrUndefined(b.entry);
        if (c.path && real === c.path) {
          if (a.install === 'copy')
            items.push({
              ...withC,
              state: 'mode-mismatch',
              action: 'none',
              detail: 'assigned as copy but exposed as a symlink',
            });
          else
            items.push(
              c.problems.length
                ? {
                    ...withC,
                    state: 'blocked',
                    action: 'none',
                    detail: `linked, but ${c.problems.join('; ')}`,
                  }
                : {
                    ...withC,
                    state: 'ok',
                    action: 'none',
                    detail: 'linked to the canonical skill',
                  },
            );
          continue;
        }
        const owned = isOwnedLink(repoRoot, b.entry);
        const state: ItemState = real ? 'wrong-target' : 'broken';
        if (!owned)
          items.push({
            ...withC,
            state: 'conflict',
            action: 'none',
            detail: `${state} symlink not owned by Ecosystem Skills (points to ${readlinkSync(b.entry)})`,
          });
        else if (c.problems.length || !c.path)
          items.push({
            ...withC,
            state: 'blocked',
            action: 'none',
            detail: `${state} link, cannot repair: ${c.problems.join('; ')}`,
          });
        else if (a.install === 'copy')
          items.push({
            ...withC,
            state: 'mode-mismatch',
            action: 'none',
            detail: `${state} owned symlink where a copy is assigned`,
          });
        else
          items.push({
            ...withC,
            state,
            action: 'repair-link',
            detail: `owned ${state} link will be re-pointed`,
          });
        continue;
      }
      if (kind === 'dir') {
        if (a.install === 'copy' && c.path) {
          const same = scanTree(b.entry).hash === c.hash;
          items.push(
            same
              ? c.problems.length
                ? {
                    ...withC,
                    state: 'blocked',
                    action: 'none',
                    detail: `copy matches, but ${c.problems.join('; ')}`,
                  }
                : {
                    ...withC,
                    state: 'ok',
                    action: 'none',
                    detail: 'copy matches the canonical content',
                  }
              : {
                  ...withC,
                  state: 'copy-modified',
                  action: 'none',
                  detail: 'copy differs from the canonical content; never overwritten',
                },
          );
        } else
          items.push({
            ...withC,
            state: 'conflict',
            action: 'none',
            detail: 'an unmanaged directory is in the way',
          });
        continue;
      }
      if (kind !== 'missing') {
        items.push({
          ...withC,
          state: 'conflict',
          action: 'none',
          detail: `an unmanaged ${kind} is in the way`,
        });
        continue;
      }
      if (c.problems.length || !c.path) {
        items.push({
          ...withC,
          state: 'blocked',
          action: 'none',
          detail: `cannot activate: ${c.problems.join('; ')}`,
        });
        continue;
      }
      items.push({
        ...withC,
        state: 'missing',
        action: a.install === 'copy' ? 'create-copy' : 'create-link',
        detail: 'not activated yet',
      });
    }

    // Entries nobody assigned: owned symlinks are stale (removable only with --prune); everything else is unmanaged.
    if (!dir.toCreate.length) {
      const names = new Set(assigned.map((a) => a.skill));
      for (const name of readdirSync(dir.path).sort()) {
        if (names.has(name)) continue;
        const b = { ...base(name), assigned: false };
        const kind = kindOf(b.entry);
        if (kind === 'symlink' && isOwnedLink(repoRoot, b.entry))
          items.push({
            ...b,
            state: 'stale',
            action: prune ? 'prune-link' : 'none',
            detail: prune
              ? 'owned link for an unassigned skill will be removed'
              : 'owned link for an unassigned skill (remove with --prune)',
          });
        else
          items.push({
            ...b,
            state: 'unmanaged',
            action: 'none',
            detail: `not managed by Ecosystem Skills (${kind}); left alone`,
          });
      }
    }
  }
  const blockers = items.filter(
    (i) =>
      ['conflict', 'blocked', 'copy-modified', 'mode-mismatch'].includes(i.state) && i.assigned,
  );
  return { consumer: consumer.id, root: projectRoot, items, dirs, blockers };
}

type Step =
  | { kind: 'mkdir'; path: string }
  | { kind: 'link'; path: string }
  | { kind: 'relink'; path: string; previous: string }
  | { kind: 'copy'; path: string }
  | { kind: 'unlink'; path: string; previous: string };

export interface ApplyResult {
  applied: string[];
  /** True when a failure occurred and completed steps were undone. */
  rolledBack: boolean;
}

const tmpName = (dir: string, name: string) =>
  join(dir, `.${name}.es-tmp-${randomBytes(4).toString('hex')}`);

/**
 * Execute a plan. Refuses to start if the plan has blockers. Each step is journaled; on any failure the
 * completed steps are undone in reverse order, so the project ends as it started.
 * `failAfter` is a test hook that simulates a failure after N steps.
 */
export function applySync(
  plan: SyncPlan,
  {
    failAfter,
    beforeRollback,
  }: {
    failAfter?: number;
    /** Test hook: runs after a failure, before completed steps are undone. */
    beforeRollback?: () => void;
  } = {},
): ApplyResult {
  if (plan.blockers.length)
    throw new ConsumerError(
      `sync stopped: ${plan.blockers.length} conflict(s); nothing was changed`,
    );
  const journal: Step[] = [];
  const done: string[] = [];
  const tick = () => {
    if (failAfter !== undefined && journal.length >= failAfter)
      throw new ConsumerError('simulated failure');
  };
  try {
    for (const d of plan.dirs) {
      tick();
      mkdirSync(d); // non-recursive: each level was checked by inspectAgentDir
      journal.push({ kind: 'mkdir', path: d });
      done.push(`created ${relative(plan.root, d)}/`);
    }
    for (const i of plan.items) {
      if (i.action === 'none' || i.action === 'mkdir') continue;
      tick();
      const dir = dirname(i.entry);
      // Re-check the parent right before writing (it may have changed since planning).
      if (realOrUndefined(dir) !== dir)
        throw new ConsumerError(`unsafe: ${dir} changed before writing`);
      if (i.action === 'create-link') {
        symlinkSync(relative(dir, i.canonical!), i.entry); // fails with EEXIST rather than overwrite
        journal.push({ kind: 'link', path: i.entry });
        done.push(`linked ${i.rel}`);
      } else if (i.action === 'repair-link') {
        if (kindOf(i.entry) !== 'symlink')
          throw new ConsumerError(`${i.rel} changed before repair`);
        const previous = readlinkSync(i.entry);
        const tmp = tmpName(dir, i.name);
        symlinkSync(relative(dir, i.canonical!), tmp);
        renameSync(tmp, i.entry); // atomically replaces the symlink itself, never its target
        journal.push({ kind: 'relink', path: i.entry, previous });
        done.push(`re-pointed ${i.rel}`);
      } else if (i.action === 'create-copy') {
        const tmp = tmpName(dir, i.name);
        cpSync(i.canonical!, tmp, {
          recursive: true,
          errorOnExist: true,
          force: false,
          verbatimSymlinks: true,
        });
        if (scanTree(tmp).hash !== i.hash) {
          rmSync(tmp, { recursive: true, force: true });
          throw new ConsumerError(`copy of ${i.name} did not match the canonical content`);
        }
        if (kindOf(i.entry) !== 'missing') {
          rmSync(tmp, { recursive: true, force: true });
          throw new ConsumerError(`${i.rel} appeared before the copy completed`);
        }
        renameSync(tmp, i.entry);
        journal.push({ kind: 'copy', path: i.entry });
        done.push(`copied ${i.rel}`);
      } else if (i.action === 'prune-link') {
        if (kindOf(i.entry) !== 'symlink')
          throw new ConsumerError(`${i.rel} changed before pruning`);
        const previous = readlinkSync(i.entry);
        unlinkSync(i.entry);
        journal.push({ kind: 'unlink', path: i.entry, previous });
        done.push(`removed stale link ${i.rel}`);
      }
    }
    tick();
    return { applied: done, rolledBack: false };
  } catch (e) {
    beforeRollback?.();
    const failed = rollback(journal);
    // Every failure, including raw filesystem errors (EACCES, EEXIST, ...), is reported as a CLI error that
    // says exactly what was undone; it never claims a rollback that did not happen.
    const reason = e instanceof Error ? e.message : String(e);
    const outcome = !journal.length
      ? 'nothing had been changed'
      : failed.length
        ? `ROLLBACK INCOMPLETE: ${journal.length - failed.length} of ${journal.length} completed step(s) were undone; could not undo: ${failed.map((f) => relative(plan.root, f)).join(', ')}. Run skills:verify and fix these by hand`
        : `all ${journal.length} completed step(s) were rolled back`;
    throw new ConsumerError(`sync failed: ${reason}; ${outcome}`, { cause: e });
  }
}

/** Undo completed steps in reverse order. Returns the paths whose step could not be undone. */
function rollback(journal: Step[]): string[] {
  const failed: string[] = [];
  for (const s of [...journal].reverse()) {
    try {
      if (s.kind === 'link' && kindOf(s.path) === 'symlink') unlinkSync(s.path);
      else if (s.kind === 'relink' && kindOf(s.path) === 'symlink') {
        const tmp = tmpName(dirname(s.path), 'rollback');
        symlinkSync(s.previous, tmp);
        renameSync(tmp, s.path);
      } else if (s.kind === 'copy' && kindOf(s.path) === 'dir')
        rmSync(s.path, { recursive: true, force: true });
      else if (s.kind === 'unlink' && kindOf(s.path) === 'missing') symlinkSync(s.previous, s.path);
      else if (s.kind === 'mkdir' && kindOf(s.path) === 'dir') {
        // A directory that is no longer empty (e.g. a link inside could not be removed) is left in place.
        if (readdirSync(s.path).length === 0) rmdirSync(s.path);
        else failed.push(s.path);
      }
    } catch {
      // Keep undoing the remaining steps; the caller reports this one as not undone.
      failed.push(s.path);
    }
  }
  return failed;
}

export type Level = 'ok' | 'warn' | 'error' | 'info';
export interface Check {
  level: Level;
  subject: string;
  message: string;
}

/**
 * Read-only integrity report for one consumer: registry policy, installation integrity, and link state.
 * It never infers runtime verification: the registry's recorded verification status is shown as-is.
 */
export function verifyConsumer(
  repoRoot: string,
  catalog: Catalog,
  consumer: Consumer,
  projectRoot: string,
): Check[] {
  const checks: Check[] = [];
  for (const a of consumer.assignments) {
    const skill = catalog.skills.find((s) => s.id === a.skill);
    if (!skill) {
      checks.push({
        level: 'error',
        subject: a.skill,
        message: 'assigned skill is not in the registry',
      });
      continue;
    }
    const c = resolveCanonical(repoRoot, skill);
    checks.push(
      c.problems.length
        ? { level: 'error', subject: a.skill, message: c.problems.join('; ') }
        : {
            level: 'ok',
            subject: a.skill,
            message:
              skill.origin === 'external'
                ? `approved; installed at the pinned revision; content hash matches`
                : `first-party source present (${skill.source.type === 'first-party' ? skill.source.path : ''})`,
          },
    );
    checks.push({
      level: 'info',
      subject: a.skill,
      message: `recorded verification: ${a.verification.status} (registry value; not inferred from links)`,
    });
  }
  const plan = planSync(repoRoot, catalog, consumer, projectRoot);
  for (const i of plan.items) {
    const level: Level =
      i.state === 'ok'
        ? 'ok'
        : i.state === 'unmanaged'
          ? 'info'
          : i.state === 'stale'
            ? 'warn'
            : 'error';
    const msg =
      i.state === 'missing' ? 'not activated (run skills:sync)' : `${i.state}: ${i.detail}`;
    checks.push({
      level,
      subject: `${i.rel} [${i.agent}]`,
      message: i.state === 'ok' ? i.detail : msg,
    });
  }
  return checks;
}
