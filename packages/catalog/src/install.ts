import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { isSafeRelPath, type Skill } from './schema.ts';
import { scanTree } from './tree.ts';
import { decide } from './policy.ts';
import { loadRegistry } from './consumers.ts';
import { kindOf } from './fsguard.ts';
import { ArchiveError, extractSkillArchive, MissingFolderError } from './archive.ts';

export const SHA_RE = /^[0-9a-f]{40}$/;
const GITHUB_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

export function parseGitHub(url: string): { owner: string; repo: string } | undefined {
  const m = url.match(GITHUB_RE);
  return m ? { owner: m[1]!, repo: m[2]! } : undefined;
}

type ExternalSource = Extract<Skill['source'], { type: 'external' }>;
export type Fetch = (
  url: string,
) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

export interface ExternalLayout {
  /** Managed directory for this repo's external content (git-ignored). */
  base: string;
}

export const layout = (repoRoot: string): ExternalLayout => ({ base: join(repoRoot, 'external') });
const dirs = (l: ExternalLayout) => ({
  skills: join(l.base, 'skills'),
  staging: join(l.base, '.staging'),
  backups: join(l.base, '.backups'),
  review: join(l.base, '.review'),
  lock: join(l.base, 'installed.json'),
});

export interface LockEntry {
  revision: string;
  contentHash: string;
  installedAt: string;
}
export type Lock = Record<string, LockEntry>;

/** Read-only view of installed.json for reporting (sync, status). The mutating engine below reads it strictly. */
export function readLock(l: ExternalLayout): Lock {
  const p = dirs(l).lock;
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Lock) : {};
}
const lockJson = (lock: Lock) =>
  JSON.stringify(
    Object.fromEntries(Object.entries(lock).sort(([a], [b]) => (a < b ? -1 : 1))),
    null,
    2,
  ) + '\n';

export class InstallError extends Error {}

const stamp = (d: Date) => d.toISOString().replace(/[:.]/g, '-');

/* ------------------------------------------------------------------ the legacy engine's transaction (audit 2) */

/**
 * Test hook: called before every filesystem mutation of the legacy engine, and once part-way through every file
 * write ("write-partial", after some bytes reached the temporary file). Throwing simulates a failure exactly there.
 */
export type Fault = (
  op: 'mkdir' | 'rename' | 'write' | 'write-partial' | 'remove',
  path: string,
) => void;

/**
 * Every managed path is under external/ and is reached through plain directories only: a symlinked external/,
 * skills/, .backups/, .backups/<id> or .staging/ could redirect a move or a write outside this repository. `final`
 * lists what the last component may be. Checked when planning and again immediately before each mutation.
 */
function assertManaged(l: ExternalLayout, p: string, final: ('dir' | 'file' | 'missing')[]) {
  const rel = relative(l.base, p);
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new InstallError(`unsafe: ${p} is outside external/; nothing was changed`);
  const chain = [l.base];
  for (const part of rel ? rel.split(sep) : []) chain.push(join(chain.at(-1)!, part));
  for (const [i, c] of chain.entries()) {
    const k = kindOf(c);
    const last = i === chain.length - 1;
    const shown = relative(dirname(l.base), c);
    if (last) {
      if (k === 'symlink')
        throw new InstallError(
          `unsafe: ${shown} is a symlink, not a plain directory or file; refusing to follow it; nothing was changed`,
        );
      if (!final.includes(k as 'dir'))
        throw new InstallError(
          `unsafe: ${shown} is ${k === 'missing' ? 'missing' : `a ${k}`}; expected ${final.join(' or ')}; nothing was changed`,
        );
    } else if (k === 'missing') {
      if (!final.includes('missing'))
        throw new InstallError(`unsafe: ${shown} is missing; nothing was changed`);
      return;
    } else if (k !== 'dir')
      throw new InstallError(
        `unsafe: ${shown} is a ${k}, not a plain directory; refusing to follow it; nothing was changed`,
      );
  }
}

/** installed.json for a change: a regular file (or absent) reached through plain directories, valid JSON. */
function readLockStrict(l: ExternalLayout): Lock {
  const p = dirs(l).lock;
  assertManaged(l, p, ['file', 'missing']);
  if (kindOf(p) === 'missing') return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Lock;
  } catch {
    throw new InstallError('external/installed.json is not valid JSON; nothing was changed');
  }
}

/** Write a temporary file next to `file`, fsync it, then rename it into place: the target is never partly written. */
function atomicWrite(file: string, content: string | Buffer, fault: Fault = () => {}) {
  const tmp = join(dirname(file), `.${basename(file)}.${randomBytes(4).toString('hex')}.tmp`);
  const buf = Buffer.from(content);
  let fd: number | undefined;
  try {
    fault('write', file);
    fd = openSync(tmp, 'wx', 0o644);
    let off = 0;
    const half = Math.floor(buf.length / 2);
    while (off < half) off += writeSync(fd, buf, off, half - off);
    fault('write-partial', file);
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, file);
  } catch (e) {
    if (fd !== undefined) closeSync(fd);
    rmSync(tmp, { force: true });
    throw e;
  }
}

/**
 * One legacy change. Every mutation re-checks its paths, then runs, and its undo is journaled the moment it has
 * succeeded; an operation that fails part-way (a write) leaves nothing to undo because the target was never touched.
 */
class LegacyTx {
  private undo: { path: string; run: () => void }[] = [];
  // plain fields: Node's type stripping (used when the website build loads this module) has no parameter properties
  private l: ExternalLayout;
  private fault: Fault;
  constructor(l: ExternalLayout, fault: Fault = () => {}) {
    this.l = l;
    this.fault = fault;
  }
  /** Create each missing directory from external/ down to `dir`, one journaled step per level. */
  ensureDir(dir: string) {
    assertManaged(this.l, dir, ['dir', 'missing']);
    const missing: string[] = [];
    for (let d = dir; kindOf(d) === 'missing'; d = dirname(d)) missing.unshift(d);
    for (const d of missing) {
      assertManaged(this.l, d, ['missing']);
      this.fault('mkdir', d);
      mkdirSync(d);
      this.undo.unshift({ path: d, run: () => rmdirSync(d) });
    }
  }
  rename(from: string, to: string) {
    assertManaged(this.l, from, ['dir']);
    assertManaged(this.l, to, ['missing']);
    this.fault('rename', to);
    renameSync(from, to);
    this.undo.unshift({ path: to, run: () => renameSync(to, from) });
  }
  write(file: string, content: string) {
    assertManaged(this.l, file, ['file', 'missing']);
    const previous = kindOf(file) === 'file' ? readFileSync(file) : undefined;
    atomicWrite(file, content, this.fault);
    this.undo.unshift({
      path: file,
      run: () => (previous === undefined ? rmSync(file) : atomicWrite(file, previous)),
    });
  }
  remove(file: string) {
    assertManaged(this.l, file, ['file']);
    const previous = readFileSync(file);
    this.fault('remove', file);
    rmSync(file);
    this.undo.unshift({ path: file, run: () => atomicWrite(file, previous) });
  }
  /** Undo every completed step, newest first; returns the steps that could not be undone. */
  rollback(): string[] {
    const failed: string[] = [];
    for (const u of this.undo)
      try {
        u.run();
      } catch {
        failed.push(relative(dirname(this.l.base), u.path));
      }
    this.undo = [];
    return failed;
  }
}

/** Fingerprint of everything a legacy change of `id` can touch, to verify a restoration rather than assume it. */
function legacyState(l: ExternalLayout, id: string): string {
  const d = dirs(l);
  const part = (p: string) => {
    const k = kindOf(p);
    return k === 'dir'
      ? `dir ${scanTree(p).hash}`
      : k === 'file'
        ? `file ${createHash('sha256').update(readFileSync(p)).digest('hex')}`
        : k;
  };
  const folder = join(d.backups, id);
  return JSON.stringify({
    lock: part(d.lock),
    live: part(join(d.skills, id)),
    backups:
      kindOf(folder) === 'dir'
        ? readdirSync(folder)
            .sort()
            .map((n) => `${n} ${part(join(folder, n))}`)
        : kindOf(folder),
  });
}

/** Undo a failed change and say, after checking, whether external/ is exactly as it was. */
function failChange(
  what: string,
  tx: LegacyTx,
  l: ExternalLayout,
  id: string,
  before: string,
  e: unknown,
): never {
  const failed = tx.rollback();
  const verified = !failed.length && legacyState(l, id) === before;
  throw new InstallError(
    `${what} failed (${e instanceof Error ? e.message : String(e)}); ${
      verified
        ? 'everything was put back as it was (verified)'
        : `ROLLBACK INCOMPLETE: ${failed.length ? `could not undo ${failed.join(', ')}` : 'the restored files differ from the originals'}; check external/ by hand`
    }`,
    { cause: e },
  );
}

/**
 * Download `source` at its pinned revision and stage only the skill folder.
 * Nothing from the archive is executed. The archive is checked against an explicit policy in memory and only the
 * skill folder (and requested root files, regular files only) is written; see archive.ts.
 * The caller owns the returned staging directory.
 */
export async function fetchSkill(
  source: ExternalSource,
  stagingRoot: string,
  fetchImpl: Fetch,
  /** Also extract top-level repository files whose names match (e.g. LICENSE); data only. */
  rootFiles?: RegExp,
): Promise<{ work: string; dir: string; root: string[] }> {
  const from = source.fork?.url ?? source.upstream.url;
  const gh = parseGitHub(from);
  if (!gh) throw new InstallError(`unsupported source (GitHub https URLs only): ${from}`);
  if (!SHA_RE.test(source.revision))
    throw new InstallError(`revision must be a full 40-character commit SHA`);
  if (source.path === '.')
    throw new InstallError(
      'SKILL.md sits at the repository root; downloading a whole repository for review or install is not supported. Inspect it with: pnpm skills:review --dir <folder>, and define a subset install before approving',
    );
  if (!isSafeRelPath(source.path)) throw new InstallError(`unsafe source path: ${source.path}`);

  mkdirSync(stagingRoot, { recursive: true });
  const work = join(stagingRoot, `${gh.repo}-${randomBytes(6).toString('hex')}`);
  mkdirSync(work, { mode: 0o700 });
  try {
    const url = `https://codeload.github.com/${gh.owner}/${gh.repo}/tar.gz/${source.revision}`;
    let res;
    try {
      res = await fetchImpl(url);
    } catch (e) {
      throw new InstallError(`download failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) throw new InstallError(`download failed: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_ARCHIVE_BYTES)
      throw new InstallError(`archive larger than ${MAX_ARCHIVE_BYTES} bytes`);
    // codeload names the top directory "<repo>-<sha>"; requiring it confirms the revision we asked for.
    // Parsed and policy-checked in memory before anything is written (see archive.ts); no system tar.
    const out = join(work, 'x');
    mkdirSync(out, { mode: 0o700 });
    let dir: string;
    let root: string[];
    try {
      ({ dir, root } = extractSkillArchive(buf, {
        top: `${gh.repo}-${source.revision}`,
        path: source.path,
        rootFiles,
        revision: source.revision,
        dest: out,
      }));
    } catch (e) {
      if (e instanceof MissingFolderError)
        throw new InstallError(`archive has no ${source.path} at revision ${source.revision}`);
      if (e instanceof ArchiveError) throw new InstallError(`archive rejected: ${e.message}`);
      throw e;
    }
    return { work, dir, root };
  } catch (e) {
    rmSync(work, { recursive: true, force: true });
    throw e;
  }
}

/** Download into the git-ignored review area for human inspection. Returns the folder; caller reviews it. */
export async function fetchForReview(
  repoRoot: string,
  skill: Skill,
  fetchImpl: Fetch,
): Promise<string> {
  if (skill.source.type !== 'external')
    throw new InstallError(`${skill.id} is not an external skill`);
  const d = dirs(layout(repoRoot));
  const target = join(d.review, `${skill.id}@${skill.source.revision}`);
  if (existsSync(target)) return target;
  const { work, dir } = await fetchSkill(skill.source, d.staging, fetchImpl);
  try {
    mkdirSync(d.review, { recursive: true });
    renameSync(dir, target);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return target;
}

/**
 * Why a skill cannot be installed, or undefined when nothing in the registry record stands in the way.
 * Pure: touches no file and no network. Checked before anything else so a refusal never leaves a trace.
 */
export function installBlocker(skill: Skill): string | undefined {
  const policy = decide({ skill, path: 'upstream-install' }).denials;
  if (policy.length) return policy.map((d) => d.message).join('; ');
  const src = skill.source;
  if (src.type !== 'external') return `${skill.id} is not an external skill`;
  const { review } = skill;
  if (review.status !== 'approved')
    return `${skill.id} is not approved (review status: ${review.status}); installation needs an owner approval for the pinned revision`;
  if (review.revision !== src.revision || !review.contentHash)
    return `${skill.id}: approval does not cover the pinned revision`;
  if (src.path === '.')
    return `${skill.id}: SKILL.md sits at the repository root, and installing a whole repository (docs, tests, media) is not supported. Review it and define a subset install first`;
  const blockers = skill.discovery?.approvalBlockers ?? [];
  if (blockers.length)
    return `${skill.id}: discovery lists unresolved approval blockers: ${blockers.join('; ')}`;
  return undefined;
}

/**
 * The registry's record for a skill, read from disk immediately before a change (never a record a caller passes
 * in), so a policy, approval or pin changed since the command started is what decides. Refuses when unreadable.
 */
function registryRecord(repoRoot: string, id: string): Skill {
  let skills: Skill[];
  try {
    skills = loadRegistry(repoRoot).catalog.skills;
  } catch (e) {
    throw new InstallError(
      `cannot read the registry (${e instanceof Error ? e.message : String(e)}); nothing was changed`,
    );
  }
  const s = skills.find((x) => x.id === id);
  if (!s) throw new InstallError(`${id} is not in the registry; nothing was changed`);
  return s;
}

/** Legacy installs and rollbacks may only put in place what the current registry record allows (ES25 audit F1). */
function assertRegistryAllows(
  repoRoot: string,
  skill: Skill,
  entry: { revision: string; contentHash: string },
) {
  const rec = registryRecord(repoRoot, skill.id);
  const blocked = installBlocker(rec);
  if (blocked) throw new InstallError(`${blocked}; nothing was changed`);
  const src = rec.source as ExternalSource;
  if (entry.revision !== src.revision || entry.contentHash !== rec.review.contentHash)
    throw new InstallError(
      `${skill.id}: this copy is revision ${entry.revision.slice(0, 12)} (${entry.contentHash.slice(0, 19)}…), but the registry approves ${src.revision.slice(0, 12)} (${(rec.review.contentHash ?? 'none').slice(0, 19)}…); only content the registry currently approves can be put in place. Revert the pin and its approval first, or install. Nothing was changed`,
    );
}

export interface InstallResult {
  status: 'installed' | 'replaced' | 'unchanged';
  backup?: string;
}

/**
 * Install an approved external skill into external/skills/<id>. Installation does not activate the skill
 * for any consumer. An existing installation is never overwritten silently: a different revision needs
 * `replace`, and the previous copy is moved to external/.backups for rollback.
 */
export async function installSkill(
  repoRoot: string,
  skill: Skill,
  fetchImpl: Fetch,
  {
    replace = false,
    now = () => new Date(),
    fault,
  }: { replace?: boolean; now?: () => Date; fault?: Fault } = {},
): Promise<InstallResult> {
  const blocked = installBlocker(skill);
  if (blocked) throw new InstallError(blocked);
  const src = skill.source;
  if (src.type !== 'external') throw new InstallError(`${skill.id} is not an external skill`);
  const { review } = skill;
  if (!review.contentHash) throw new InstallError(`${skill.id}: approval has no content hash`);
  // a readable, valid registry is required, and it decides (not the record passed in): before downloading, and again
  // immediately before the first change (audit 3)
  assertRegistryAllows(repoRoot, skill, {
    revision: src.revision,
    contentHash: review.contentHash,
  });

  const l = layout(repoRoot);
  const d = dirs(l);
  const target = join(d.skills, skill.id);
  // managed paths are plain directories before anything is downloaded into them (audit 2)
  for (const p of [d.staging, d.skills, join(d.backups, skill.id)])
    assertManaged(l, p, ['dir', 'missing']);
  assertManaged(l, target, ['dir', 'missing']);
  const lock = readLockStrict(l);
  const current = lock[skill.id];

  if (existsSync(target)) {
    if (!current)
      throw new InstallError(`${target} exists but is not in installed.json; refusing to touch it`);
    const onDisk = scanTree(target).hash;
    if (onDisk !== current.contentHash)
      throw new InstallError(
        `${skill.id}: installed copy was modified locally (hash mismatch); refusing to replace`,
      );
    if (current.revision === src.revision && current.contentHash === review.contentHash)
      return { status: 'unchanged' };
    if (!replace)
      throw new InstallError(
        `${skill.id} is installed at ${current.revision}; pass --replace to update`,
      );
  }

  const { work, dir } = await fetchSkill(src, d.staging, fetchImpl);
  try {
    const scan = scanTree(dir);
    if (!scan.files.some((f) => f.path === 'SKILL.md'))
      throw new InstallError(`${skill.id}: no SKILL.md in ${src.path}`);
    if (scan.special.length)
      throw new InstallError(
        `${skill.id}: contains symlinks/special files: ${scan.special.join(', ')}`,
      );
    if (scan.hash !== review.contentHash)
      throw new InstallError(
        `${skill.id}: content hash ${scan.hash} does not match reviewed ${review.contentHash}`,
      );

    // decide again from the registry on disk, right before the first change (a caller's record is not trusted)
    assertRegistryAllows(repoRoot, skill, { revision: src.revision, contentHash: scan.hash });
    const lockNow = readLockStrict(l);
    const when = now();
    const dest = join(d.backups, skill.id, stamp(when));
    if (kindOf(target) !== 'missing') {
      assertManaged(l, dest, ['missing']);
      assertManaged(l, `${dest}.json`, ['missing']);
    }
    const before = legacyState(l, skill.id);
    const tx = new LegacyTx(l, fault);
    let previous: string | undefined;
    try {
      tx.ensureDir(d.skills);
      if (kindOf(target) !== 'missing') {
        tx.ensureDir(join(d.backups, skill.id));
        tx.rename(target, dest);
        if (current) tx.write(`${dest}.json`, JSON.stringify(current, null, 2) + '\n');
        previous = dest;
      }
      tx.rename(dir, target);
      tx.write(
        d.lock,
        lockJson({
          ...lockNow,
          [skill.id]: {
            revision: src.revision,
            contentHash: scan.hash,
            installedAt: when.toISOString(),
          },
        }),
      );
    } catch (e) {
      failChange(`${skill.id}: install`, tx, l, skill.id, before, e);
    }
    return { status: previous ? 'replaced' : 'installed', backup: previous };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function backupsOf(l: ExternalLayout, id: string): string[] {
  const p = join(dirs(l).backups, id);
  assertManaged(l, p, ['dir', 'missing']);
  return kindOf(p) === 'dir'
    ? readdirSync(p)
        .filter((n) => !n.endsWith('.json'))
        .sort()
        .map((n) => join(p, n))
    : [];
}

/**
 * Restore the most recent backup of a skill. The current installation is itself moved to the backups
 * folder first, so a rollback can be undone by rolling back again.
 *
 * A rollback puts content back where consumer links point, so it is an installation like any other (ES25 audit F1):
 * the registry record on disk is read immediately before the first change and must allow a legacy install of exactly
 * this revision and content hash (open distribution, approved, no blockers). A backup of a revision the registry no
 * longer approves is refused; the owner reverts the pin and its approval first. A failure part-way puts everything
 * back as it was.
 */
export function rollbackSkill(
  repoRoot: string,
  id: string,
  { now = () => new Date(), fault }: { now?: () => Date; fault?: Fault } = {},
): LockEntry {
  const l = layout(repoRoot);
  const d = dirs(l);
  // validate everything before the first destructive step: paths, backup, metadata, policy, destinations
  const latest = backupsOf(l, id).at(-1);
  if (!latest) throw new InstallError(`${id}: no backup to roll back to`);
  if (kindOf(latest) !== 'dir') throw new InstallError(`${id}: backup is not a plain directory`);
  if (kindOf(`${latest}.json`) !== 'file')
    throw new InstallError(`${id}: backup ${latest} has no metadata; restore it by hand`);
  assertManaged(l, latest, ['dir']);
  let entry: LockEntry;
  try {
    entry = JSON.parse(readFileSync(`${latest}.json`, 'utf8')) as LockEntry;
  } catch {
    throw new InstallError(`${id}: backup metadata is not valid JSON; nothing was changed`);
  }
  if (typeof entry?.revision !== 'string' || typeof entry?.contentHash !== 'string')
    throw new InstallError(`${id}: backup metadata is incomplete; nothing was changed`);
  const scan = scanTree(latest);
  if (scan.special.length)
    throw new InstallError(`${id}: backup contains symlinks or special files; nothing was changed`);
  if (scan.hash !== entry.contentHash)
    throw new InstallError(`${id}: backup content does not match its recorded hash`);
  const lock = readLockStrict(l);
  const target = join(d.skills, id);
  assertManaged(l, target, ['dir', 'missing']);
  const when = now();
  const moved = join(d.backups, id, `${stamp(when)}-rolledback`);
  const live = kindOf(target) === 'dir';
  if (live) {
    // where the current install goes must be free, so its metadata can never fail half-way (audit 1)
    assertManaged(l, moved, ['missing']);
    assertManaged(l, `${moved}.json`, ['missing']);
  }
  // policy, approval and pin, decided from the registry on disk immediately before the first change
  assertRegistryAllows(repoRoot, { id } as Skill, entry);
  const before = legacyState(l, id);
  const tx = new LegacyTx(l, fault);
  try {
    if (live) {
      tx.rename(target, moved);
      if (lock[id]) tx.write(`${moved}.json`, JSON.stringify(lock[id], null, 2) + '\n');
    }
    tx.ensureDir(d.skills);
    tx.rename(latest, target);
    tx.write(d.lock, lockJson({ ...lock, [id]: entry }));
    tx.remove(`${latest}.json`);
  } catch (e) {
    failChange(`${id}: rollback`, tx, l, id, before, e);
  }
  return entry;
}

/** Move an installation into the backups folder (never deletes) and drop it from installed.json. */
export function uninstallSkill(
  repoRoot: string,
  id: string,
  { now = () => new Date(), fault }: { now?: () => Date; fault?: Fault } = {},
): void {
  const l = layout(repoRoot);
  const d = dirs(l);
  const lock = readLockStrict(l);
  const target = join(d.skills, id);
  assertManaged(l, target, ['dir', 'missing']);
  if (kindOf(target) !== 'dir' || !lock[id]) throw new InstallError(`${id} is not installed`);
  const dest = join(d.backups, id, `${stamp(now())}-uninstalled`);
  assertManaged(l, join(d.backups, id), ['dir', 'missing']);
  assertManaged(l, dest, ['missing']);
  assertManaged(l, `${dest}.json`, ['missing']);
  const rest = { ...lock };
  delete rest[id];
  const before = legacyState(l, id);
  const tx = new LegacyTx(l, fault);
  try {
    tx.ensureDir(join(d.backups, id));
    tx.rename(target, dest);
    tx.write(`${dest}.json`, JSON.stringify(lock[id], null, 2) + '\n');
    tx.write(d.lock, lockJson(rest));
  } catch (e) {
    failChange(`${id}: uninstall`, tx, l, id, before, e);
  }
}

export type InstallState = 'installed' | 'modified' | 'missing';

/** Compare installed.json with what is on disk. Local, machine-specific; never part of the catalog. */
export function installStatus(
  repoRoot: string,
): { id: string; revision: string; state: InstallState }[] {
  const l = layout(repoRoot);
  return Object.entries(readLock(l)).map(([id, e]) => {
    const p = join(dirs(l).skills, id);
    const state: InstallState = !existsSync(p)
      ? 'missing'
      : scanTree(p).hash === e.contentHash
        ? 'installed'
        : 'modified';
    return { id, revision: e.revision, state };
  });
}
