import { randomBytes } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { assertSkillId, isInside, kindOf } from './fsguard.ts';
import { SEMVER, isSafeRelPath, type Catalog, type Release } from './schema.ts';
import { scanTree, type TreeScan } from './tree.ts';

/*
 * The curated library (ES17): library/<skill>/<version>/ holds content only. It is hashed, so no manifest lives
 * inside it; everything about a release is in registry/releases.json. Git is the audit and version-control base.
 * Nothing in this module runs content, and nothing here installs: the existing installer and sync never read library/.
 */

export const LIBRARY_DIR = 'library';
const LICENSE_FILE = /^licen[cs]e(\.[a-z]+)?$/i;
export const ATTRIBUTION_FILE = 'ATTRIBUTION.md';

export class LibraryError extends Error {}

const releaseKey = (r: Pick<Release, 'skill' | 'version'>) => `${r.skill}@${r.version}`;

/** Problems with one release folder on disk; empty means the files match the record. */
export function verifyRelease(root: string, release: Release): string[] {
  const at = releaseKey(release);
  const problems: string[] = [];
  const expected = `${LIBRARY_DIR}/${release.skill}/${release.version}`;
  if (release.path !== expected || !isSafeRelPath(release.path))
    return [`${at}: unsafe or non-canonical path ${release.path}`];
  // no symlinked component on the way: library, library/<skill>, library/<skill>/<version>
  for (const rel of [LIBRARY_DIR, `${LIBRARY_DIR}/${release.skill}`, release.path]) {
    const k = kindOf(join(root, rel));
    if (k === 'missing') return [`${at}: ${rel} is missing`];
    if (k !== 'dir') return [`${at}: ${rel} is a ${k}, not a plain directory`];
  }
  const folder = join(root, release.path);
  const real = realpathSync(folder);
  if (!isInside(realpathSync(join(root, LIBRARY_DIR)), real))
    return [`${at}: resolves outside ${LIBRARY_DIR}/`];
  const scan = scanTree(folder);
  if (scan.special.length)
    problems.push(`${at}: contains symlinks or special files: ${scan.special.join(', ')}`);
  if (!scan.files.some((f) => f.path === 'SKILL.md')) problems.push(`${at}: no SKILL.md`);
  if (scan.hash !== release.curatedHash)
    problems.push(
      `${at}: content hash ${scan.hash} does not match the recorded ${release.curatedHash}`,
    );
  if (!scan.special.length) problems.push(...referenceProblems(root, release));
  if (release.upstream) {
    const top = scan.files.map((f) => f.path).filter((p) => !p.includes('/'));
    if (!top.some((p) => LICENSE_FILE.test(p)))
      problems.push(
        `${at}: no LICENSE file; the upstream licence notice must travel with the copy`,
      );
    if (!top.includes(ATTRIBUTION_FILE)) problems.push(`${at}: no ${ATTRIBUTION_FILE}`);
  }
  return problems;
}

/** Every recorded release must match its files, and nothing in library/ may be unrecorded. */
export function verifyLibrary(root: string, catalog: Pick<Catalog, 'releases'>): string[] {
  const problems: string[] = [];
  for (const r of catalog.releases) problems.push(...verifyRelease(root, r));
  const base = join(root, LIBRARY_DIR);
  if (!existsSync(base)) return problems;
  if (kindOf(base) !== 'dir') return [...problems, `${LIBRARY_DIR} is not a plain directory`];
  const known = new Set(catalog.releases.map(releaseKey));
  for (const skill of readdirSync(base).sort()) {
    const p = join(base, skill);
    if (kindOf(p) === 'file' && skill === 'README.md') continue;
    if (kindOf(p) !== 'dir') {
      problems.push(`unexpected entry ${LIBRARY_DIR}/${skill}`);
      continue;
    }
    for (const version of readdirSync(p).sort()) {
      const v = join(p, version);
      if (kindOf(v) !== 'dir' || !SEMVER.test(version))
        problems.push(`unexpected entry ${LIBRARY_DIR}/${skill}/${version}`);
      else if (!known.has(`${skill}@${version}`))
        problems.push(
          `untracked release folder ${LIBRARY_DIR}/${skill}/${version} (no record in registry/releases.json)`,
        );
    }
  }
  return problems;
}

export interface TreeDiff {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: string[];
}

/** File-level comparison of two scans (path, content hash and exec bit), e.g. upstream versus curated. */
export function compareTrees(from: TreeScan, to: TreeScan): TreeDiff {
  const a = new Map(from.files.map((f) => [f.path, f]));
  const b = new Map(to.files.map((f) => [f.path, f]));
  const out: TreeDiff = { added: [], removed: [], changed: [], unchanged: [] };
  for (const [p, f] of b) {
    const o = a.get(p);
    if (!o) out.added.push(p);
    else if (o.sha256 !== f.sha256 || o.executable !== f.executable) out.changed.push(p);
    else out.unchanged.push(p);
  }
  for (const p of a.keys()) if (!b.has(p)) out.removed.push(p);
  for (const k of Object.keys(out) as (keyof TreeDiff)[]) out[k].sort();
  return out;
}

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/**
 * Releases are append-only. Comparing the registry as it was (e.g. at HEAD) with what it is now:
 * a release may not disappear, and its identity, content, provenance, licence and modifications may not change.
 * Once approved, its review, supported agents, dependencies and restrictions are frozen too; the only allowed
 * change is withdrawing the approval. Changed content needs a new version.
 */
export function checkReleaseHistory(previous: Release[], current: Release[]): string[] {
  const problems: string[] = [];
  const now = new Map(current.map((r) => [releaseKey(r), r]));
  for (const old of previous) {
    const k = releaseKey(old);
    const cur = now.get(k);
    if (!cur) {
      problems.push(`${k}: release was removed; withdraw it instead`);
      continue;
    }
    for (const f of [
      'path',
      'createdAt',
      'upstream',
      'curatedHash',
      'license',
      'attribution',
      'modifications',
    ] as const)
      if (!same(old[f], cur[f]))
        problems.push(`${k}: "${f}" of an existing release must not change; publish a new version`);
    if (old.approval.status === 'approved') {
      for (const f of ['review', 'supportedAgents', 'dependencies', 'restrictions'] as const)
        if (!same(old[f], cur[f]))
          problems.push(`${k}: "${f}" of an approved release is immutable; publish a new version`);
      if (cur.approval.status === 'unapproved')
        problems.push(`${k}: an approved release cannot return to unapproved; withdraw it`);
      if (cur.approval.status === 'approved' && !same(old.approval, cur.approval))
        problems.push(`${k}: the approval record of an approved release must not change`);
    }
  }
  return problems;
}

export interface StageResult {
  path: string;
  hash: string;
}

/**
 * Copy a prepared folder into library/<skill>/<version>/ without ever overwriting: it refuses an existing
 * version, symlinks and special files, copies to a temporary sibling, re-hashes the copy, and renames it into
 * place (atomic on one filesystem). Content only: the registry record is written by hand, with its review.
 */
export function stageRelease(
  root: string,
  { skill, version, from }: { skill: string; version: string; from: string },
): StageResult {
  assertSkillId(skill);
  if (!SEMVER.test(version))
    throw new LibraryError(`version "${version}" is not a semantic version like 1.0.0`);
  if (kindOf(from) !== 'dir') throw new LibraryError(`${from} is not a plain directory`);
  const src = scanTree(from);
  if (src.special.length)
    throw new LibraryError(`source contains symlinks or special files: ${src.special.join(', ')}`);
  if (!src.files.some((f) => f.path === 'SKILL.md'))
    throw new LibraryError('source has no SKILL.md');
  const base = join(root, LIBRARY_DIR);
  const skillDir = join(base, skill);
  for (const p of [base, skillDir])
    if (existsSync(p) && kindOf(p) !== 'dir')
      throw new LibraryError(`${p} is not a plain directory`);
  const target = join(skillDir, version);
  if (existsSync(target))
    throw new LibraryError(
      `${LIBRARY_DIR}/${skill}/${version} already exists; releases are immutable, use a new version`,
    );
  mkdirSync(skillDir, { recursive: true });
  const tmp = join(base, `.staging-${randomBytes(6).toString('hex')}`);
  try {
    cpSync(from, tmp, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      errorOnExist: true,
    });
    const copied = scanTree(tmp);
    if (copied.hash !== src.hash)
      throw new LibraryError('copy does not match the source (hash mismatch); nothing was staged');
    renameSync(tmp, target);
    return { path: `${LIBRARY_DIR}/${skill}/${version}`, hash: copied.hash };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Differences between upstream and the curated copy that the release record does not declare. Empty means every
 * added, changed or removed file is listed in `modifications` with the matching kind; a curated copy must never pass
 * as an unchanged upstream release.
 */
export function undeclaredDifferences(diff: TreeDiff, release: Release): string[] {
  const declared = new Set(release.modifications.map((m) => `${m.kind}:${m.path}`));
  const out: string[] = [];
  for (const [kind, paths] of [
    ['added', diff.added],
    ['changed', diff.changed],
    ['removed', diff.removed],
  ] as const)
    for (const p of paths)
      if (!declared.has(`${kind}:${p}`))
        out.push(`${kind} ${p} is not declared in the release modifications`);
  for (const m of release.modifications) {
    const paths =
      m.kind === 'added' ? diff.added : m.kind === 'changed' ? diff.changed : diff.removed;
    if (!paths.includes(m.path))
      out.push(`modification "${m.kind} ${m.path}" is declared but the trees do not show it`);
  }
  return out;
}

export interface OutOfFolderReference {
  path: string;
  line: number;
  target: string;
}

/**
 * Markdown links (and src/href attributes) in a folder's text files that point outside the folder, e.g.
 * `../sibling/SKILL.md` or `/abs/path`. URLs (http:, https:, mailto:, ...) and in-page anchors are ignored.
 * Symlinks are never followed (only regular files from scanTree are read).
 */
export function outOfFolderReferences(dir: string): OutOfFolderReference[] {
  const out: OutOfFolderReference[] = [];
  for (const f of scanTree(dir).files) {
    if (!/\.(md|markdown|txt|html?)$/i.test(f.path)) continue;
    const text = readFileSync(join(dir, f.path), 'utf8');
    const lines = text.split('\n');
    // Fenced code is example content (e.g. `<a href="/about">` in an HTML snippet), not a link the skill depends on.
    // Only closed fences count: an unclosed fence could otherwise hide every link after it. The security scanner
    // still reads fenced code; only dependency detection skips it.
    const fenced = new Set<number>();
    if (/\.(md|markdown)$/i.test(f.path)) {
      let open: { at: number; marker: string } | undefined;
      lines.forEach((line, i) => {
        const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
        if (!marker) return;
        if (!open) open = { at: i, marker };
        else if (marker[0] === open.marker[0] && marker.length >= open.marker.length) {
          for (let j = open.at; j <= i; j++) fenced.add(j);
          open = undefined;
        }
      });
    }
    lines.forEach((line, i) => {
      if (fenced.has(i)) return;
      for (const m of line.matchAll(
        /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|\b(?:src|href)\s*=\s*"([^"]+)"/g,
      )) {
        const raw = (m[1] ?? m[2] ?? '').trim();
        if (!raw || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//'))
          continue;
        const clean = raw.split('#')[0]!.split('?')[0]!;
        if (!clean) continue;
        const abs = isAbsolute(clean) ? clean : resolve(dirname(join(dir, f.path)), clean);
        const rel = relative(dir, abs);
        if (isAbsolute(clean) || rel === '..' || rel.startsWith('../') || isAbsolute(rel))
          out.push({ path: f.path, line: i + 1, target: raw });
      }
    });
  }
  return out;
}

/** Out-of-folder references that the release does not declare, and declarations that no longer match the files. */
export function referenceProblems(root: string, release: Release): string[] {
  const at = `${release.skill}@${release.version}`;
  const found = outOfFolderReferences(join(root, release.path));
  const key = (p: string, t: string) => `${p}\u0000${t}`;
  const declared = new Set((release.references ?? []).map((r) => key(r.path, r.target)));
  const seen = new Set(found.map((r) => key(r.path, r.target)));
  const problems: string[] = [];
  for (const f of found)
    if (!declared.has(key(f.path, f.target)))
      problems.push(
        `${at}: ${f.path}:${f.line} links outside the release (${f.target}) and the reference is not declared`,
      );
  for (const r of release.references ?? [])
    if (!seen.has(key(r.path, r.target)))
      problems.push(`${at}: declared reference ${r.path} -> ${r.target} is not in the files`);
  return problems;
}
