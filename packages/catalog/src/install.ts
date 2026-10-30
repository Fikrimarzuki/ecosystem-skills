import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isSafeRelPath, type Skill } from './schema.ts';
import { scanTree } from './tree.ts';
import { kindOf } from './fsguard.ts';

const run = promisify(execFile);

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

export function readLock(l: ExternalLayout): Lock {
  const p = dirs(l).lock;
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Lock) : {};
}
function writeLock(l: ExternalLayout, lock: Lock) {
  const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(dirs(l).lock, JSON.stringify(sorted, null, 2) + '\n');
}

export class InstallError extends Error {}

const stamp = (d: Date) => d.toISOString().replace(/[:.]/g, '-');

/** Move an installed copy into backups/<id>/<stamp>, with <stamp>.json holding its full lock entry. */
function backup(
  l: ExternalLayout,
  id: string,
  entry: LockEntry | undefined,
  when: Date,
  suffix = '',
): string {
  const folder = join(dirs(l).backups, id);
  mkdirSync(folder, { recursive: true });
  const dest = join(folder, `${stamp(when)}${suffix}`);
  renameSync(join(dirs(l).skills, id), dest);
  if (entry) writeFileSync(`${dest}.json`, JSON.stringify(entry, null, 2) + '\n');
  return dest;
}

/**
 * Download `source` at its pinned revision and stage only the skill folder.
 * Nothing from the archive is executed; `tar` (a system tool) only extracts the requested member.
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
  mkdirSync(work);
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
    const archive = join(work, 'archive.tgz');
    writeFileSync(archive, buf);

    // codeload names the top directory "<repo>-<sha>"; requiring it confirms the revision we asked for.
    const top = `${gh.repo}-${source.revision}`;
    const out = join(work, 'x');
    mkdirSync(out);
    try {
      await run('tar', ['-xzf', archive, '-C', out, `${top}/${source.path}`]);
    } catch {
      throw new InstallError(`archive has no ${source.path} at revision ${source.revision}`);
    }
    const dir = join(out, top, source.path);
    if (!existsSync(dir))
      throw new InstallError(`archive has no ${source.path} at revision ${source.revision}`);
    const root: string[] = [];
    if (rootFiles) {
      const { stdout } = await run('tar', ['-tzf', archive]);
      const names = stdout
        .split('\n')
        .filter((m) => m.startsWith(`${top}/`) && !m.slice(top.length + 1).includes('/'))
        .map((m) => m.slice(top.length + 1))
        .filter((n) => n && rootFiles.test(n));
      if (names.length)
        await run('tar', ['-xzf', archive, '-C', out, ...names.map((n) => `${top}/${n}`)]);
      // Only regular files: an archive member that is a symlink (e.g. LICENSE -> /etc/passwd) must never be read.
      for (const n of names) if (kindOf(join(out, top, n)) === 'file') root.push(join(out, top, n));
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
  { replace = false, now = () => new Date() }: { replace?: boolean; now?: () => Date } = {},
): Promise<InstallResult> {
  const blocked = installBlocker(skill);
  if (blocked) throw new InstallError(blocked);
  const src = skill.source;
  if (src.type !== 'external') throw new InstallError(`${skill.id} is not an external skill`);
  const { review } = skill;
  if (!review.contentHash) throw new InstallError(`${skill.id}: approval has no content hash`);

  const l = layout(repoRoot);
  const d = dirs(l);
  const target = join(d.skills, skill.id);
  const lock = readLock(l);
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

    mkdirSync(d.skills, { recursive: true });
    const previous = existsSync(target) ? backup(l, skill.id, current, now()) : undefined;
    renameSync(dir, target);
    writeLock(l, {
      ...lock,
      [skill.id]: {
        revision: src.revision,
        contentHash: scan.hash,
        installedAt: now().toISOString(),
      },
    });
    return { status: previous ? 'replaced' : 'installed', backup: previous };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function backupsOf(l: ExternalLayout, id: string): string[] {
  const p = join(dirs(l).backups, id);
  return existsSync(p)
    ? readdirSync(p)
        .filter((n) => !n.endsWith('.json'))
        .sort()
        .map((n) => join(p, n))
    : [];
}

/**
 * Restore the most recent backup of a skill. The current installation is itself moved to the backups
 * folder first, so a rollback can be undone by rolling back again.
 */
export function rollbackSkill(
  repoRoot: string,
  id: string,
  { now = () => new Date() } = {},
): LockEntry {
  const l = layout(repoRoot);
  const d = dirs(l);
  const lock = readLock(l);
  const latest = backupsOf(l, id).at(-1);
  if (!latest) throw new InstallError(`${id}: no backup to roll back to`);
  if (!existsSync(`${latest}.json`))
    throw new InstallError(`${id}: backup ${latest} has no metadata; restore it by hand`);
  const entry = JSON.parse(readFileSync(`${latest}.json`, 'utf8')) as LockEntry;
  if (scanTree(latest).hash !== entry.contentHash)
    throw new InstallError(`${id}: backup content does not match its recorded hash`);
  if (existsSync(join(d.skills, id))) backup(l, id, lock[id], now(), '-rolledback');
  mkdirSync(d.skills, { recursive: true });
  renameSync(latest, join(d.skills, id));
  rmSync(`${latest}.json`);
  writeLock(l, { ...lock, [id]: entry });
  return entry;
}

/** Move an installation into the backups folder (never deletes) and drop it from installed.json. */
export function uninstallSkill(
  repoRoot: string,
  id: string,
  { now = () => new Date() } = {},
): void {
  const l = layout(repoRoot);
  const lock = readLock(l);
  if (!existsSync(join(dirs(l).skills, id)) || !lock[id])
    throw new InstallError(`${id} is not installed`);
  backup(l, id, lock[id], now(), '-uninstalled');
  const rest = { ...lock };
  delete rest[id];
  writeLock(l, rest);
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
