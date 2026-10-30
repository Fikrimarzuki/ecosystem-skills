import { randomBytes } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readlinkSync,
  renameSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { releaseInstallProblems, releasesOf } from './availability.ts';
import { findConsumer, loadRegistry, SUPPORTED_AGENTS, type LoadedRegistry } from './consumers.ts';
import {
  ConsumerError,
  formatJson,
  inspectAgentDir,
  isInside,
  kindOf,
  realOrUndefined,
  writeFileAtomic,
} from './fsguard.ts';
import { verifyRelease, compareTrees, type TreeDiff } from './library.ts';
import { PROJECT_SKILL_DIRS } from './links.ts';
import { resolveCanonical } from './sync.ts';
import { buildCatalog } from './validate.ts';
import type { Agent, Release, Skill } from './schema.ts';
import { scanTree } from './tree.ts';
import {
  CURATED_LOCK,
  LEGACY,
  readCuratedLock,
  releaseIdentity,
  STORE,
  storePath,
  storeRoot,
  storeState,
  type Deployment,
  type StoreState,
} from './store.ts';

/*
 * Curated installation, upgrade and rollback (ES18, ES21). One engine:
 *
 *   library/<skill>/<version>      immutable, reviewed content in the repository
 *        │  copy (staging → re-hash → atomic rename); never overwritten
 *        ▼
 *   external/releases/<skill>/<version>      machine-local store, one folder per version (git-ignored)
 *        │  relative symlink, created or re-pointed atomically
 *        ▼
 *   <consumer>/.claude/skills/<skill>, <consumer>/.agents/skills/<skill>
 *
 * Desired state stays in registry/consumers.json (`assignment.release`); what was installed, when and for which
 * consumer is tracked in external/releases.lock.json, never in the consumer repository. Only approved releases with a
 * clean security review and no blockers qualify; there is no fallback to upstream downloads; bundled scripts are copied
 * as files and never run. Every change is journaled and undone in reverse order if any step fails.
 */

export type Mode = 'install' | 'upgrade' | 'rollback';
export interface LinkStep {
  agent: Agent;
  rel: string;
  entry: string;
  /** What is there now: nothing, our link to a version (or "legacy"), or something we do not own. */
  current: 'missing' | 'conflict' | string;
  action: 'create' | 'repoint' | 'none' | 'blocked';
  detail: string;
}
export interface CuratedPlan {
  mode: Mode;
  root: string;
  consumer: string;
  project: string;
  skill: string;
  /** Target: a release version, or "legacy" (rollback of a migration only). */
  target: string;
  release?: Release;
  /** Absolute path the consumer links will point to. */
  targetPath?: string;
  targetHash?: string;
  current?: string;
  store: StoreState | 'n/a';
  files: string[];
  diff?: TreeDiff;
  links: LinkStep[];
  dirs: string[];
  review?: { outcome: string; scope?: string };
  approval?: string;
  blockers: string[];
  notes: string[];
  rollbackTo?: { version: string; available: boolean; detail: string };
  agents: Agent[];
  /** Internal: registry text the plan was computed from, so apply can refuse concurrent edits. */
  registryText: string;
  lockText: string | undefined;
}

export interface PlanOptions {
  mode: Mode;
  consumer: string;
  skill: string;
  /** Required: an explicit version (or "legacy" for rollback). */
  version: string;
  project: string;
  agents?: Agent[];
  /** upgrade only: allow moving a legacy (upstream) installation to a curated release. */
  migrate?: boolean;
}

const ownedTarget = (root: string, skill: string, real: string): string | undefined => {
  const legacy = realOrUndefined(join(root, 'external', 'skills', skill));
  if (legacy && real === legacy) return LEGACY;
  const base = realOrUndefined(join(storeRoot(root), skill));
  if (base && isInside(base, real) && dirname(real) === base) return real.slice(base.length + 1);
  return undefined;
};

/** Read-only. Computes everything an install, upgrade or rollback would do, and why it may not. */
export function planCurated(root: string, opts: PlanOptions): CuratedPlan {
  const reg: LoadedRegistry = loadRegistry(root);
  const { catalog } = reg;
  const { lock, text: lockText } = readCuratedLock(root);
  const consumer = findConsumer(reg, opts.consumer);
  const blockers: string[] = [];
  const notes: string[] = [];
  if (consumer.kind === 'global')
    throw new ConsumerError(`"${consumer.id}" is a global consumer; out of scope`);
  const skill = catalog.skills.find((s) => s.id === opts.skill);
  if (!skill) throw new ConsumerError(`unknown skill "${opts.skill}"`);
  if (skill.source.type !== 'external')
    throw new ConsumerError(`${skill.id} is first-party; it is not installed from the library`);
  const assignment = consumer.assignments.find((a) => a.skill === skill.id);
  const current = assignment ? (assignment.release ?? LEGACY) : undefined;
  const history = lock.consumers[consumer.id]?.[skill.id]?.history ?? [];
  const target = opts.version;
  const legacyTarget = target === LEGACY;

  // ---- mode rules
  if (opts.mode === 'install' && assignment)
    blockers.push(
      `${skill.id} is already assigned to ${consumer.id} (${current === LEGACY ? 'legacy upstream install' : `curated ${current}`}); use upgrade or rollback`,
    );
  if (opts.mode !== 'install' && !assignment)
    blockers.push(`${skill.id} is not assigned to ${consumer.id}; use install`);
  if (opts.mode !== 'rollback' && legacyTarget) blockers.push('"legacy" is only a rollback target');
  if (assignment && current === target)
    blockers.push(`${consumer.id} already uses ${skill.id} ${target}`);
  if (opts.mode === 'upgrade' && current === LEGACY && !opts.migrate)
    blockers.push(
      `${consumer.id} uses the legacy upstream install of ${skill.id}; moving it to a curated release is a migration: pass --migrate (reversible with rollback --to legacy)`,
    );
  if (opts.mode === 'rollback' && !history.some((h) => h.version === target))
    blockers.push(
      `${skill.id} ${target} was never installed for ${consumer.id} here; rollback only restores a previously installed version`,
    );
  if (assignment && assignment.install !== 'symlink')
    blockers.push(
      `${skill.id} is assigned in copy mode; curated activation supports symlinks only`,
    );

  // ---- target content
  let release: Release | undefined;
  let targetPath: string | undefined;
  let targetHash: string | undefined;
  let store: StoreState | 'n/a' = 'n/a';
  let files: string[] = [];
  if (legacyTarget) {
    if (skill.review.status !== 'approved')
      blockers.push(`${skill.id} is not approved for the legacy upstream install`);
    const c = resolveCanonical(root, skill);
    if (c.problems.length || !c.path)
      blockers.push(`legacy install of ${skill.id} is not usable: ${c.problems.join('; ')}`);
    else {
      targetPath = c.path;
      targetHash = c.hash;
      files = scanTree(c.path).files.map((f) => f.path);
    }
  } else {
    release = releasesOf(catalog.releases, skill.id).find((r) => r.version === target);
    if (!release) blockers.push(`${skill.id} has no curated release ${target}`);
    else {
      for (const p of releaseInstallProblems(skill, release))
        blockers.push(`${skill.id}@${target}: ${p.code}${p.detail ? ` (${p.detail})` : ''}`);
      if (
        release.upstream &&
        (release.upstream.url !== skill.source.upstream.url ||
          release.upstream.path !== skill.source.path)
      )
        blockers.push(`${skill.id}@${target}: provenance does not match the registered source`);
      for (const p of verifyRelease(root, release)) blockers.push(`library: ${p}`);
      store = storeState(root, lock, release);
      if (store === 'tampered')
        blockers.push(
          `store copy ${STORE.join('/')}/${skill.id}/${target} does not match the release; refusing to use or replace it`,
        );
      if (store === 'untracked')
        blockers.push(
          `store folder ${STORE.join('/')}/${skill.id}/${target} exists but was not installed by this tool; refusing to touch it`,
        );
      if (store === 'unsafe')
        blockers.push(`${STORE.join('/')} is not a plain directory tree; refusing to write`);
      if (opts.mode === 'rollback' && store !== 'verified')
        blockers.push(`rollback needs the previously installed copy in the store; it is ${store}`);
      targetPath = storePath(root, skill.id, target);
      targetHash = release.curatedHash;
      files = existsSync(join(root, release.path))
        ? scanTree(join(root, release.path)).files.map((f) => f.path)
        : [];
      if (release.approval.status === 'withdrawn') notes.push('this release was withdrawn');
      // out-of-folder references (ES22): never install a release whose links would be broken
      for (const ref of release.references) {
        if (ref.resolution === 'unresolved') {
          blockers.push(
            `${skill.id}@${target}: ${ref.path} links outside the release (${ref.target}); the reference is unresolved`,
          );
          continue;
        }
        const dep = ref.requires!;
        const has = consumer.assignments.find((x) => x.skill === dep.skill);
        if (!has)
          blockers.push(
            `missing dependency: ${dep.skill}@${dep.version} must be installed for ${consumer.id} first (${ref.path} links to ${ref.target})`,
          );
        else if (has.release !== dep.version)
          blockers.push(
            `mismatched dependency: ${consumer.id} uses ${dep.skill} ${has.release ?? 'legacy'}, but ${skill.id}@${target} needs ${dep.version}`,
          );
      }
      // compatibility as recorded on the release (documented, not tested by this tool)
      const wanted = opts.agents ?? assignment?.agents ?? consumer.agents;
      if (!release.supportedAgents.length)
        notes.push('the release lists no supported agents: compatibility is untested');
      else
        for (const ag of wanted)
          if (!release.supportedAgents.includes(ag))
            notes.push(`the release does not list ${ag} as a supported agent`);
      for (const d of release.dependencies) notes.push(`dependency: ${d}`);
      for (const r2 of release.restrictions) notes.push(`restriction: ${r2}`);
    }
  }

  // ---- diff against what the consumer uses now
  let diff: TreeDiff | undefined;
  const currentPath =
    current === LEGACY
      ? resolveCanonical(root, skill).path
      : current
        ? existsSync(storePath(root, skill.id, current))
          ? storePath(root, skill.id, current)
          : undefined
        : undefined;
  const targetContent = legacyTarget ? targetPath : release ? join(root, release.path) : undefined;
  if (currentPath && targetContent && existsSync(targetContent))
    diff = compareTrees(scanTree(currentPath), scanTree(targetContent));

  // ---- consumer links
  const agents = [
    ...new Set(
      opts.agents ??
        assignment?.agents ??
        consumer.agents.filter((a) => SUPPORTED_AGENTS.includes(a)),
    ),
  ].sort() as Agent[];
  if (!agents.length) blockers.push(`no supported agents for ${consumer.id}; pass --agents`);
  const links: LinkStep[] = [];
  const dirs: string[] = [];
  for (const agent of agents) {
    const relDir = PROJECT_SKILL_DIRS[agent];
    if (!relDir) {
      blockers.push(`unsupported agent ${agent}`);
      continue;
    }
    const d = inspectAgentDir(opts.project, relDir); // throws on symlinked or non-directory components
    for (const x of d.toCreate) if (!dirs.includes(x)) dirs.push(x);
    const entry = join(d.path, skill.id);
    const rel = `${relDir}/${skill.id}`;
    const k = d.toCreate.length ? 'missing' : kindOf(entry);
    if (k === 'missing') {
      links.push({
        agent,
        rel,
        entry,
        current: 'missing',
        action: 'create',
        detail: 'will be linked',
      });
      continue;
    }
    if (k !== 'symlink') {
      links.push({
        agent,
        rel,
        entry,
        current: 'conflict',
        action: 'blocked',
        detail: `an unmanaged ${k} is in the way`,
      });
      blockers.push(`${rel}: an unmanaged ${k} is in the way; nothing will overwrite it`);
      continue;
    }
    const real = realOrUndefined(entry);
    const owner = real ? ownedTarget(root, skill.id, real) : undefined;
    if (!owner) {
      links.push({
        agent,
        rel,
        entry,
        current: 'conflict',
        action: 'blocked',
        detail: `symlink not owned by Ecosystem Skills (points to ${readlinkSync(entry)})`,
      });
      blockers.push(`${rel}: symlink not owned by Ecosystem Skills`);
      continue;
    }
    if (targetPath && real === realOrUndefined(targetPath))
      links.push({
        agent,
        rel,
        entry,
        current: owner,
        action: 'none',
        detail: 'already points to the target',
      });
    else
      links.push({
        agent,
        rel,
        entry,
        current: owner,
        action: 'repoint',
        detail: `${owner} → ${target}`,
      });
  }

  // ---- what a later rollback could restore
  let rollbackTo: CuratedPlan['rollbackTo'];
  if (current) {
    const ok =
      current === LEGACY
        ? !resolveCanonical(root, skill).problems.length
        : (() => {
            const r = releasesOf(catalog.releases, skill.id).find((x) => x.version === current);
            return !!r && storeState(root, lock, r) === 'verified';
          })();
    rollbackTo = {
      version: current,
      available: ok,
      detail: ok
        ? `rollback to ${current} stays possible`
        : `the ${current} copy is not verified here; rollback to it would be refused`,
    };
  }

  return {
    mode: opts.mode,
    root,
    consumer: consumer.id,
    project: opts.project,
    skill: skill.id,
    target,
    release,
    targetPath,
    targetHash,
    current,
    store,
    files,
    diff,
    links,
    dirs,
    review: release ? { outcome: release.review.outcome, scope: release.review.scope } : undefined,
    approval: release?.approval.status,
    blockers,
    notes,
    rollbackTo,
    agents,
    registryText: reg.text.consumers,
    lockText,
  };
}

type Step =
  | { kind: 'store'; path: string }
  | { kind: 'mkdir'; path: string }
  | { kind: 'link'; path: string }
  | { kind: 'relink'; path: string; previous: string }
  | { kind: 'file'; path: string; previous: string | undefined };

export interface ApplyOptions {
  now?: () => Date;
  /** Test hook: throw after this many completed steps. */
  failAfter?: number;
}
export interface ApplyResult {
  applied: string[];
}

const tmpName = (dir: string, name: string) =>
  join(dir, `.${name}.es-${randomBytes(4).toString('hex')}.tmp`);

/**
 * Perform a plan that has no blockers. Order: store copy, registry assignment, links, lock. If anything fails,
 * every completed step is undone in reverse order and the error says what was (or could not be) undone.
 */
export function applyCurated(
  plan: CuratedPlan,
  { now = () => new Date(), failAfter }: ApplyOptions = {},
): ApplyResult {
  if (plan.blockers.length)
    throw new ConsumerError(
      `refused: ${plan.blockers.length} blocker(s); nothing was changed:\n  - ${plan.blockers.join('\n  - ')}`,
    );
  if (!plan.targetPath || !plan.targetHash) throw new ConsumerError('nothing to install');
  const { root } = plan;
  const journal: Step[] = [];
  const done: string[] = [];
  const tick = () => {
    if (failAfter !== undefined && journal.length >= failAfter)
      throw new ConsumerError('simulated failure');
  };
  try {
    // 1. store: copy the verified library folder into the machine-local store (never over an existing folder)
    const r = plan.release;
    const { lock } = readCuratedLock(root);
    if (r && plan.store === 'absent') {
      tick();
      // create each missing parent explicitly so a rollback removes exactly what this install created
      // Re-check right before writing (the tree may have changed since the preview): every existing component
      // must be a plain directory, never a symlink, so the copy cannot be redirected outside the store.
      for (const d of [join(root, 'external'), storeRoot(root), join(storeRoot(root), r.skill)]) {
        const k = kindOf(d);
        if (k !== 'missing' && k !== 'dir')
          throw new ConsumerError(`unsafe: ${relative(root, d)} is a ${k}; refusing to write`);
      }
      for (const d of [storeRoot(root), join(storeRoot(root), r.skill)])
        if (kindOf(d) === 'missing') {
          mkdirSync(d);
          journal.push({ kind: 'mkdir', path: d });
        }
      const tmp = join(storeRoot(root), r.skill, `.staging-${randomBytes(6).toString('hex')}`);
      try {
        cpSync(join(root, r.path), tmp, {
          recursive: true,
          dereference: false,
          verbatimSymlinks: true,
          errorOnExist: true,
        });
        const s = scanTree(tmp);
        if (s.special.length || s.hash !== r.curatedHash)
          throw new ConsumerError(
            'copied content does not match the release; nothing was installed',
          );
        if (existsSync(plan.targetPath))
          throw new ConsumerError(`${relative(root, plan.targetPath)} appeared during install`);
        renameSync(tmp, plan.targetPath);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
      journal.push({ kind: 'store', path: plan.targetPath });
      done.push(`stored ${relative(root, plan.targetPath)}`);
      lock.store[`${r.skill}@${r.version}`] = {
        contentHash: r.curatedHash,
        installedAt: now().toISOString(),
        release: releaseIdentity(r),
      };
    }
    // 2. desired state in the registry (validated as a whole before writing)
    tick();
    const reg = loadRegistry(root);
    if (reg.text.consumers !== plan.registryText)
      throw new ConsumerError('registry/consumers.json changed since the preview; run it again');
    const consumers = reg.raw.consumers.map((c) => {
      if (c.id !== plan.consumer) return c;
      const list = (c.assignments ?? []) as Record<string, unknown>[];
      const has = list.some((a) => a.skill === plan.skill);
      const next = has
        ? list.map((a) => {
            if (a.skill !== plan.skill) return a;
            const {
              release: _old,
              verification: _v,
              ...rest
            } = a as { release?: string; verification?: unknown };
            void _old;
            void _v;
            // a different version is a different install: earlier verification no longer applies
            return plan.target === LEGACY
              ? { ...rest, verification: { status: 'unverified' } }
              : { ...rest, release: plan.target, verification: { status: 'unverified' } };
          })
        : [
            ...list,
            {
              skill: plan.skill,
              agents: plan.agents,
              install: 'symlink',
              release: plan.target,
              verification: { status: 'unverified' },
            },
          ];
      return { ...c, assignments: next };
    });
    const check = buildCatalog({ ...reg.raw, consumers });
    if (!check.ok)
      throw new ConsumerError(
        `the change would make the registry invalid:\n  - ${check.errors.join('\n  - ')}`,
      );
    const file = join(root, 'registry', 'consumers.json');
    writeFileAtomic(file, formatJson(consumers), { expectedCurrent: reg.text.consumers });
    journal.push({ kind: 'file', path: file, previous: reg.text.consumers });
    done.push(`registry: ${plan.consumer} → ${plan.skill} ${plan.target}`);
    // 3. consumer links
    for (const d of plan.dirs) {
      tick();
      mkdirSync(d);
      journal.push({ kind: 'mkdir', path: d });
    }
    for (const l of plan.links) {
      if (l.action === 'none') continue;
      tick();
      const dir = dirname(l.entry);
      if (realOrUndefined(dir) !== dir)
        throw new ConsumerError(`unsafe: ${dir} changed before writing`);
      const target = relative(dir, plan.targetPath);
      if (l.action === 'create') {
        symlinkSync(target, l.entry); // EEXIST rather than overwrite
        journal.push({ kind: 'link', path: l.entry });
      } else {
        if (kindOf(l.entry) !== 'symlink')
          throw new ConsumerError(`${l.rel} changed before it could be re-pointed`);
        const previous = readlinkSync(l.entry);
        const tmp = tmpName(dir, plan.skill);
        symlinkSync(target, tmp);
        renameSync(tmp, l.entry); // atomic replacement of the link itself
        journal.push({ kind: 'relink', path: l.entry, previous });
      }
      done.push(`${l.action === 'create' ? 'linked' : 're-pointed'} ${l.rel}`);
    }
    // 4. tracking (machine-local, never in the consumer repository)
    tick();
    const fresh = readCuratedLock(root);
    if (
      fresh.text !== plan.lockText &&
      !(r && plan.store === 'absent' && fresh.text === plan.lockText)
    )
      throw new ConsumerError(`${CURATED_LOCK} changed since the preview; run it again`);
    for (const [k, v] of Object.entries(lock.store)) fresh.lock.store[k] = v;
    const per = (fresh.lock.consumers[plan.consumer] ??= {});
    const at = now().toISOString();
    const prior = per[plan.skill];
    const history = prior?.history ?? [];
    if (!prior && plan.current === LEGACY) {
      // record what was there before the first curated change, so it can be restored explicitly
      history.push({
        version: LEGACY,
        contentHash: resolveCanonical(root, findSkillIn(root, plan.skill)).hash ?? '',
        at,
        action: 'baseline',
      });
    }
    const dep: Deployment = {
      version: plan.target,
      contentHash: plan.targetHash,
      at,
      action:
        plan.mode === 'install'
          ? 'install'
          : plan.mode === 'rollback'
            ? 'rollback'
            : plan.current === LEGACY
              ? 'migrate'
              : 'upgrade',
      ...(r ? { release: releaseIdentity(r) } : {}),
    };
    history.push(dep);
    per[plan.skill] = { current: dep, history };
    const lockFile = join(root, CURATED_LOCK);
    mkdirSync(dirname(lockFile), { recursive: true });
    writeFileAtomic(lockFile, formatJson(fresh.lock), { expectedCurrent: fresh.text });
    journal.push({ kind: 'file', path: lockFile, previous: fresh.text });
    done.push(`tracked ${plan.consumer}/${plan.skill} ${plan.target} in ${CURATED_LOCK}`);
    tick();
    return { applied: done };
  } catch (e) {
    const failed = undo(journal);
    const reason = e instanceof Error ? e.message : String(e);
    const outcome = !journal.length
      ? 'nothing had been changed'
      : failed.length
        ? `ROLLBACK INCOMPLETE: could not undo ${failed.map((f) => relative(root, f)).join(', ')}; fix these by hand`
        : `all ${journal.length} completed step(s) were rolled back`;
    throw new ConsumerError(`${plan.mode} failed: ${reason}; ${outcome}`, { cause: e });
  }
}

function findSkillIn(root: string, id: string): Skill {
  const s = loadRegistry(root).catalog.skills.find((x) => x.id === id);
  if (!s) throw new ConsumerError(`unknown skill "${id}"`);
  return s;
}

function undo(journal: Step[]): string[] {
  const failed: string[] = [];
  for (const s of [...journal].reverse()) {
    try {
      if (s.kind === 'link' && kindOf(s.path) === 'symlink') unlinkSync(s.path);
      else if (s.kind === 'relink' && kindOf(s.path) === 'symlink') {
        const tmp = tmpName(dirname(s.path), 'rollback');
        symlinkSync(s.previous, tmp);
        renameSync(tmp, s.path);
      } else if (s.kind === 'mkdir' && kindOf(s.path) === 'dir') rmdirSync(s.path);
      else if (s.kind === 'store' && kindOf(s.path) === 'dir')
        rmSync(s.path, { recursive: true, force: true });
      else if (s.kind === 'file') {
        if (s.previous === undefined) rmSync(s.path, { force: true });
        else writeFileAtomic(s.path, s.previous);
      }
    } catch {
      failed.push(s.path);
    }
  }
  return failed;
}

/** Human-readable preview; never touches anything. */
export function formatPlan(p: CuratedPlan): string {
  const lines = [
    `${p.mode.toUpperCase()} PREVIEW: ${p.skill} ${p.current ? `${p.current} → ` : ''}${p.target} for ${p.consumer}`,
    `  project: ${p.project}`,
    `  release approval: ${p.approval ?? 'n/a'}; security review: ${p.review ? `${p.review.outcome}${p.review.scope ? ' (scoped)' : ''}` : 'n/a'}`,
    `  content: ${p.targetPath ? relative(p.root, p.targetPath) : 'unavailable'} (store: ${p.store}); ${p.files.length} file(s): ${p.files.join(', ')}`,
  ];
  if (p.diff)
    lines.push(
      `  changes vs current: +${p.diff.added.length} added, ${p.diff.changed.length} changed, -${p.diff.removed.length} removed, ${p.diff.unchanged.length} identical${[...p.diff.added.map((x) => ` +${x}`), ...p.diff.changed.map((x) => ` ~${x}`), ...p.diff.removed.map((x) => ` -${x}`)].join('')}`,
    );
  for (const d of p.dirs) lines.push(`  mkdir ${relative(p.project, d)}`);
  for (const l of p.links)
    lines.push(`  ${l.action.padEnd(8)} ${l.rel} (${l.current}) ${l.detail}`);
  if (p.rollbackTo) lines.push(`  rollback afterwards: ${p.rollbackTo.detail}`);
  for (const n of p.notes) lines.push(`  note: ${n}`);
  if (p.blockers.length)
    lines.push(`BLOCKED (${p.blockers.length}):`, ...p.blockers.map((b) => `  - ${b}`));
  else lines.push('No blockers. Nothing was changed; re-run with --apply to perform exactly this.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ inventory (ES21) */

export interface InventoryRow {
  skill: string;
  agents: Agent[];
  kind: 'legacy' | 'curated';
  /** What the registry says this consumer should use: "legacy" or a release version. */
  desired: string;
  /** What the consumer's links point to now, when the project location is known. */
  installed?: string;
  /** Content hash recorded for this consumer's current curated install (machine-local tracking). */
  installedHash?: string;
  store?: StoreState;
  /** Newest approved release newer than what is used now. */
  available?: string;
  drift: string[];
  upgrade: { to?: string; eligible: boolean; why: string };
  rollback: { to?: string; available: boolean; why: string };
}

/** Read-only view of one consumer's skills: legacy vs curated, desired vs installed, drift, upgrades, rollback. */
export function consumerInventory(
  root: string,
  consumerId: string,
  project?: string,
): InventoryRow[] {
  const reg = loadRegistry(root);
  const { catalog } = reg;
  const consumer = findConsumer(reg, consumerId);
  const { lock } = readCuratedLock(root);
  const rows: InventoryRow[] = [];
  for (const a of consumer.assignments) {
    const skill = catalog.skills.find((s) => s.id === a.skill);
    if (!skill || skill.source.type !== 'external') continue;
    const desired = a.release ?? LEGACY;
    const rels = releasesOf(catalog.releases, skill.id);
    const approved = rels.filter((r) => releaseInstallProblems(skill, r).length === 0);
    const newer = approved.find((r) => desired === LEGACY || compareSemver(r.version, desired) > 0);
    const tracked = lock.consumers[consumerId]?.[skill.id];
    const drift: string[] = [];
    let store: StoreState | undefined;
    if (a.release) {
      const r = rels.find((x) => x.version === a.release);
      store = r ? storeState(root, lock, r) : undefined;
      if (store !== 'verified') drift.push(`store copy of ${a.release} is ${store ?? 'unknown'}`);
      if (tracked && tracked.current.version !== a.release)
        drift.push(
          `tracking says ${tracked.current.version} was installed, the registry wants ${a.release}`,
        );
      if (!tracked) drift.push('no install of this version is tracked on this machine');
    } else if (resolveCanonical(root, skill).problems.length)
      drift.push('the legacy upstream install is not usable here');
    let installed: string | undefined;
    if (project) {
      const seen = new Set<string>();
      for (const ag of a.agents) {
        const relDir = PROJECT_SKILL_DIRS[ag];
        if (!relDir) continue;
        const entry = join(project, relDir, skill.id);
        const k = kindOf(entry);
        if (k === 'missing') seen.add('missing');
        else if (k !== 'symlink') seen.add('conflict');
        else {
          const real = realOrUndefined(entry);
          seen.add((real && ownedTarget(root, skill.id, real)) ?? 'conflict');
        }
      }
      installed = seen.size === 1 ? [...seen][0] : seen.size ? 'mixed' : undefined;
      if (installed && installed !== desired)
        drift.push(`links point to ${installed}, the registry wants ${desired}`);
    }
    const prev = tracked
      ? [...tracked.history].reverse().find((h) => h.version !== tracked.current.version)
      : undefined;
    let rollback: InventoryRow['rollback'] = {
      available: false,
      why: 'no earlier install is tracked for this consumer on this machine',
    };
    if (prev) {
      const ok =
        prev.version === LEGACY
          ? !resolveCanonical(root, skill).problems.length
          : (() => {
              const r = rels.find((x) => x.version === prev.version);
              return (
                !!r &&
                storeState(root, lock, r) === 'verified' &&
                releaseInstallProblems(skill, r).length === 0
              );
            })();
      rollback = {
        to: prev.version,
        available: ok,
        why: ok
          ? `rollback to ${prev.version} is possible`
          : `${prev.version} is no longer verified or approved here`,
      };
    }
    rows.push({
      skill: skill.id,
      agents: a.agents,
      kind: a.release ? 'curated' : 'legacy',
      desired,
      installed,
      installedHash: tracked?.current.contentHash,
      store,
      available: newer?.version,
      drift,
      upgrade: newer
        ? {
            to: newer.version,
            eligible: true,
            why:
              desired === LEGACY
                ? `migration to ${newer.version} is possible (upgrade --migrate)`
                : `approved ${newer.version} is available`,
          }
        : {
            eligible: false,
            why: rels.length ? 'no newer approved release' : 'no curated release exists',
          },
      rollback,
    });
  }
  return rows;
}

const compareSemver = (a: string, b: string) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!;
};
