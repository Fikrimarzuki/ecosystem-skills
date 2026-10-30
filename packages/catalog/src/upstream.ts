import { execFile } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdtempSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { compareVersions, curationBlockers, releasesOf } from './availability.ts';
import { formatJson, kindOf, writeFileAtomic } from './fsguard.ts';
import { fetchSkill, InstallError, parseGitHub, type Fetch } from './install.ts';
import {
  compareTrees,
  LibraryError,
  outOfFolderReferences,
  stageRelease,
  type TreeDiff,
} from './library.ts';
import { reviewTree } from './review.ts';
import { readFrontmatter } from './secreview.ts';
import {
  SEMVER,
  type Catalog,
  type ChangeSummary,
  type Release,
  type Skill,
  type UpstreamCheck,
} from './schema.ts';
export type { ChangeSummary, UpstreamCheck } from './schema.ts';
export { UPDATE_STATUSES, type UpdateStatus } from './schema.ts';
import { scanTree } from './tree.ts';
import { buildCatalog } from './validate.ts';

/*
 * Upstream update detection and release preparation (ES20). Manual, never scheduled, never installs.
 * Downloads are data only (tar extracts named members; nothing is executed). A prepared release is always
 * unreviewed and unapproved: approval of an older version is never inherited.
 */

export class RemoteError extends Error {
  constructor(
    message: string,
    readonly kind: 'missing' | 'failed',
  ) {
    super(message);
  }
}

/** Network access, injectable for tests. */
export interface Remote {
  /** Commit the default branch points to. Throws RemoteError. */
  head(url: string): Promise<string>;
  /** Download the skill folder (and root licence files) at a revision. Throws RemoteError. */
  folder(
    url: string,
    revision: string,
    path: string,
    staging: string,
  ): Promise<{ work: string; dir: string; root: string[] }>;
  /** Commit date of a revision, best effort. */
  commitDate?(url: string, revision: string): Promise<string | undefined>;
}

const LICENSE_NAME = /^(licen[cs]e|copying|notice)(\.[a-z]+)?$/i;
const sh = promisify(execFile);

/** Real network access: `git ls-remote` (no API quota) and codeload tarballs through fetchSkill. */
export function networkRemote(fetchImpl: Fetch = fetch): Remote {
  return {
    async head(url) {
      // Only https GitHub repositories: registry data must not point the checker at arbitrary hosts or protocols.
      if (!parseGitHub(url))
        throw new RemoteError(`unsupported source (https GitHub URLs only): ${url}`, 'failed');
      try {
        const { stdout } = await sh('git', ['ls-remote', '--exit-code', url, 'HEAD'], {
          timeout: 30_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
        });
        const sha = stdout.trim().split(/\s+/)[0] ?? '';
        if (!/^[0-9a-f]{40}$/.test(sha))
          throw new RemoteError(`unexpected ls-remote output for ${url}`, 'failed');
        return sha;
      } catch (e) {
        if (e instanceof RemoteError) throw e;
        const msg = String((e as { stderr?: string }).stderr ?? (e as Error).message ?? e);
        if (/not found|could not read Username|terminal prompts disabled|does not exist/i.test(msg))
          throw new RemoteError(`repository unavailable: ${url}`, 'missing');
        throw new RemoteError(`could not reach ${url}: ${msg.split('\n')[0]}`, 'failed');
      }
    },
    async folder(url, revision, path, staging) {
      try {
        return await fetchSkill(
          { type: 'external', upstream: { url }, path, revision },
          staging,
          fetchImpl,
          LICENSE_NAME,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/archive has no/.test(msg) || /HTTP 404/.test(msg))
          throw new RemoteError(msg, 'missing');
        throw new RemoteError(msg, 'failed');
      }
    },
    async commitDate(url, revision) {
      if (!parseGitHub(url) || !/^[0-9a-f]{40}$/.test(revision)) return undefined;
      try {
        const res = await fetch(`${url.replace(/\/$/, '')}/commits/${revision}.atom`);
        if (!res.ok) return undefined;
        return (await res.text()).match(/<updated>(\d{4}-\d{2}-\d{2})/)?.[1];
      } catch {
        return undefined;
      }
    },
  };
}

const SCRIPT_EXT = new Set([
  '.sh',
  '.bash',
  '.zsh',
  '.py',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.rb',
  '.pl',
  '.ps1',
  '.bat',
  '.cmd',
]);
const DEP_FILES =
  /^(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements.*\.txt|pyproject\.toml|poetry\.lock|Cargo\.(toml|lock)|go\.(mod|sum)|Gemfile(\.lock)?)$/;

/** Classify what changed between two folders, and which changes deserve security attention. */
export function classifyChanges(oldDir: string, newDir: string): ChangeSummary {
  const a = scanTree(oldDir);
  const b = scanTree(newDir);
  const diff: TreeDiff = compareTrees(a, b);
  const touched = [...diff.added, ...diff.changed, ...diff.removed];
  const exec = new Set(b.files.filter((f) => f.executable).map((f) => f.path));
  const kinds: ChangeSummary['kinds'] = {
    instructions: touched.includes('SKILL.md'),
    references: [],
    scripts: [],
    hooks: [],
    dependencies: [],
    licenses: [],
    assets: [],
    permissions: false,
  };
  for (const p of touched) {
    if (p === 'SKILL.md') continue;
    const name = basename(p);
    if (LICENSE_NAME.test(name)) kinds.licenses.push(p);
    else if (/(^|\/)hooks?(\/|\.json$)|settings(\.local)?\.json$/i.test(p)) kinds.hooks.push(p);
    else if (DEP_FILES.test(name)) kinds.dependencies.push(p);
    else if (SCRIPT_EXT.has(extname(p).toLowerCase()) || exec.has(p)) kinds.scripts.push(p);
    else if (/\.(md|txt|ya?ml|json)$/i.test(p)) kinds.references.push(p);
    else kinds.assets.push(p);
  }
  // Read SKILL.md only when it is a regular file: a symlinked SKILL.md in a downloaded folder must not make
  // this process read (and then publish in registry/updates.json) a file from outside the download.
  const fm = (d: string) =>
    kindOf(join(d, 'SKILL.md')) === 'file'
      ? readFrontmatter(readFileSync(join(d, 'SKILL.md'), 'utf8'))
      : {};
  const fa = fm(oldDir);
  const fb = fm(newDir);
  kinds.permissions = ['allowed-tools', 'hooks', 'model', 'context'].some(
    (k) => (fa[k] ?? '') !== (fb[k] ?? ''),
  );
  const sensitive: string[] = [];
  for (const [label, d] of [
    ['pinned', oldDir],
    ['new', newDir],
  ] as const)
    if (existsSync(join(d, 'SKILL.md')) && kindOf(join(d, 'SKILL.md')) !== 'file')
      sensitive.push(`SKILL.md in the ${label} folder is not a regular file (symlink or special)`);
  if (kinds.scripts.length) sensitive.push(`scripts changed: ${kinds.scripts.join(', ')}`);
  if (kinds.hooks.length)
    sensitive.push(`hook or settings files changed: ${kinds.hooks.join(', ')}`);
  if (kinds.dependencies.length)
    sensitive.push(`dependency manifests changed: ${kinds.dependencies.join(', ')}`);
  if (kinds.permissions)
    sensitive.push(
      `frontmatter permissions changed (allowed-tools: "${fa['allowed-tools'] ?? ''}" → "${fb['allowed-tools'] ?? ''}")`,
    );
  if (kinds.licenses.length) sensitive.push(`licence files changed: ${kinds.licenses.join(', ')}`);
  const ra = reviewTree(oldDir, a);
  const rb = reviewTree(newDir, b);
  const newBinaries = rb.binaries.filter((x) => !ra.binaries.includes(x));
  if (newBinaries.length) sensitive.push(`new non-text files: ${newBinaries.join(', ')}`);
  const count = (hits: { label: string }[]) =>
    hits.reduce<Record<string, number>>((m, h) => ((m[h.label] = (m[h.label] ?? 0) + 1), m), {});
  const ca = count(ra.hits);
  const cb = count(rb.hits);
  for (const [label, n] of Object.entries(cb))
    if (n > (ca[label] ?? 0) && label !== 'HTML comment')
      sensitive.push(`more "${label}" signals (${ca[label] ?? 0} → ${n})`);
  return {
    added: diff.added,
    removed: diff.removed,
    changed: diff.changed,
    kinds,
    securitySensitive: sensitive,
  };
}

/** The folder hash this registry vouches for at the pinned revision, if it records one. */
export function pinnedHash(skill: Skill, releases: Release[]): string | undefined {
  if (skill.source.type !== 'external') return undefined;
  const rev = skill.source.revision;
  if (skill.review.contentHash && skill.review.revision === rev) return skill.review.contentHash;
  if (skill.discovery?.contentHash) return skill.discovery.contentHash;
  return releases.find((r) => r.skill === skill.id && r.upstream?.revision === rev)?.upstream
    ?.contentHash;
}

const reviewSensitive = (skill: Skill, releases: Release[]) =>
  skill.review.status === 'approved' || releases.some((r) => r.skill === skill.id);

export interface CheckOptions {
  now?: () => Date;
  staging: string;
  /** One head lookup per repository per batch. */
  heads?: Map<string, Promise<string>>;
}

/** Check one skill against its upstream. Never throws for remote problems: they become a status. */
export async function checkSkill(
  skill: Skill,
  catalog: Pick<Catalog, 'releases'>,
  remote: Remote,
  opts: CheckOptions,
): Promise<UpstreamCheck> {
  if (skill.source.type !== 'external')
    throw new InstallError(`${skill.id} is first-party; nothing to check`);
  const src = skill.source;
  const base = {
    skill: skill.id,
    checkedAt: (opts.now ?? (() => new Date()))().toISOString(),
    pinnedRevision: src.revision,
  };
  let latest: string;
  try {
    const heads = opts.heads ?? new Map();
    if (!heads.has(src.upstream.url)) heads.set(src.upstream.url, remote.head(src.upstream.url));
    latest = await heads.get(src.upstream.url)!;
  } catch (e) {
    const err = e instanceof RemoteError ? e : new RemoteError(String(e), 'failed');
    return {
      ...base,
      status: err.kind === 'missing' ? 'source-unavailable' : 'check-failed',
      detail: err.message,
    };
  }
  if (latest === src.revision)
    return {
      ...base,
      latestRevision: latest,
      status: 'up-to-date',
      detail: 'the default branch is still at the pinned commit',
    };
  const latestCommitDate = await remote.commitDate?.(src.upstream.url, latest);
  const dated = latestCommitDate ? { latestCommitDate } : {};
  if (src.path === '.')
    return {
      ...base,
      latestRevision: latest,
      ...dated,
      status: 'review-required',
      detail:
        'the repository moved on; this is a repository-root skill, so its contents are not downloaded for comparison',
    };
  const works: string[] = [];
  try {
    let next;
    try {
      next = await remote.folder(src.upstream.url, latest, src.path, opts.staging);
    } catch (e) {
      const err = e instanceof RemoteError ? e : new RemoteError(String(e), 'failed');
      return {
        ...base,
        latestRevision: latest,
        ...dated,
        status: err.kind === 'missing' ? 'source-unavailable' : 'check-failed',
        detail:
          err.kind === 'missing'
            ? `the skill folder ${src.path} no longer exists at the latest commit (deleted or moved)`
            : err.message,
      };
    }
    works.push(next.work);
    const latestContentHash = scanTree(next.dir).hash;
    const known = pinnedHash(skill, catalog.releases);
    if (known && known === latestContentHash)
      return {
        ...base,
        latestRevision: latest,
        ...dated,
        latestContentHash,
        status: 'up-to-date',
        detail: 'the repository moved on, but this skill folder is unchanged',
      };
    let pinned;
    try {
      pinned = await remote.folder(src.upstream.url, src.revision, src.path, opts.staging);
    } catch (e) {
      return {
        ...base,
        latestRevision: latest,
        ...dated,
        latestContentHash,
        status: 'check-failed',
        detail: `could not download the pinned folder for comparison: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    works.push(pinned.work);
    if (scanTree(pinned.dir).hash === latestContentHash)
      return {
        ...base,
        latestRevision: latest,
        ...dated,
        latestContentHash,
        status: 'up-to-date',
        detail: 'the repository moved on, but this skill folder is unchanged',
      };
    const changes = classifyChanges(pinned.dir, next.dir);
    const sensitive = reviewSensitive(skill, catalog.releases);
    return {
      ...base,
      latestRevision: latest,
      ...dated,
      latestContentHash,
      changes,
      status: sensitive ? 'review-required' : 'update-available',
      detail: `${changes.added.length} added, ${changes.changed.length} changed, ${changes.removed.length} removed${changes.securitySensitive.length ? `; security-sensitive: ${changes.securitySensitive.length}` : ''}${sensitive ? '; this skill is approved or curated, so the new folder must be reviewed before anything uses it' : ''}`,
    };
  } finally {
    for (const w of works) rmSync(w, { recursive: true, force: true });
  }
}

/** Check several skills one after another, with a pause between network calls. */
export async function checkMany(
  skills: Skill[],
  catalog: Pick<Catalog, 'releases'>,
  remote: Remote,
  opts: CheckOptions & { delayMs?: number; limit?: number; sleep?: (ms: number) => Promise<void> },
): Promise<UpstreamCheck[]> {
  const limit = opts.limit ?? 25;
  if (skills.length > limit)
    throw new InstallError(
      `refusing to check ${skills.length} skills in one run (limit ${limit}); narrow it or raise --limit`,
    );
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const heads = opts.heads ?? new Map<string, Promise<string>>();
  const out: UpstreamCheck[] = [];
  for (const [i, s] of skills.entries()) {
    if (i && opts.delayMs) await sleep(opts.delayMs);
    out.push(await checkSkill(s, catalog, remote, { ...opts, heads }));
  }
  return out;
}

/** Merge new results into registry/upstream-checks.json (one record per skill, newest wins). */
export function mergeChecks(previous: UpstreamCheck[], fresh: UpstreamCheck[]): UpstreamCheck[] {
  const m = new Map(previous.map((c) => [c.skill, c]));
  for (const c of fresh) m.set(c.skill, c);
  return [...m.values()].sort((a, b) => (a.skill < b.skill ? -1 : 1));
}

/* ------------------------------------------------------------------ release preparation */

export interface PreparePlan {
  skill: string;
  version: string;
  revision?: string;
  blockers: string[];
  notes: string[];
  files: string[];
  record?: Release;
  /** Internal: prepared folder and download work dirs. */
  prepared?: string;
  cleanup: string[];
}

const SPDX: [RegExp, string][] = [
  [/Apache License[\s\S]*Version 2\.0/i, 'Apache-2.0'],
  [/Permission is hereby granted, free of charge/i, 'MIT'],
  [/Redistribution and use in source and binary forms/i, 'BSD-3-Clause'],
];
export const detectLicense = (text: string) => SPDX.find(([re]) => re.test(text))?.[1];

/**
 * Prepare (but never approve) a new curated release from an upstream revision. Read-only until `applyPrepare`.
 * The new record always starts unreviewed and unapproved, whatever happened to earlier versions.
 */
export async function preparePlan(
  root: string,
  catalog: Catalog,
  opts: { skill: string; version: string; revision?: string; now?: () => Date },
  remote: Remote,
): Promise<PreparePlan> {
  const plan: PreparePlan = {
    skill: opts.skill,
    version: opts.version,
    blockers: [],
    notes: [],
    files: [],
    cleanup: [],
  };
  const skill = catalog.skills.find((s) => s.id === opts.skill);
  if (!skill) return { ...plan, blockers: [`unknown skill "${opts.skill}"`] };
  if (skill.source.type !== 'external')
    return { ...plan, blockers: [`${skill.id} is first-party`] };
  if (!SEMVER.test(opts.version)) plan.blockers.push(`"${opts.version}" is not a semantic version`);
  const existing = releasesOf(catalog.releases, skill.id);
  if (existing.some((r) => r.version === opts.version))
    plan.blockers.push(`${skill.id}@${opts.version} already exists; releases are immutable`);
  else if (
    existing[0] &&
    SEMVER.test(opts.version) &&
    compareVersions(opts.version, existing[0].version) <= 0
  )
    plan.blockers.push(
      `${opts.version} must be greater than the newest release ${existing[0].version}`,
    );
  for (const b of curationBlockers(skill))
    plan.blockers.push(`curation is blocked: ${b.code}${b.detail ? ` (${b.detail})` : ''}`);
  if (plan.blockers.length) return plan;
  let revision = opts.revision;
  try {
    revision ??= await remote.head(skill.source.upstream.url);
  } catch (e) {
    return {
      ...plan,
      blockers: [
        `cannot resolve the upstream revision: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }
  if (!/^[0-9a-f]{40}$/.test(revision))
    return { ...plan, blockers: ['--revision must be a full 40-character commit SHA'] };
  plan.revision = revision;
  const staging = mkdtempSync(join(tmpdir(), 'es-prepare-'));
  plan.cleanup.push(staging);
  let got;
  try {
    got = await remote.folder(skill.source.upstream.url, revision, skill.source.path, staging);
  } catch (e) {
    return {
      ...plan,
      blockers: [
        `cannot download ${skill.source.path} at ${revision.slice(0, 12)}: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }
  const upstreamHash = scanTree(got.dir).hash;
  const prepared = join(staging, 'prepared');
  cpSync(got.dir, prepared, { recursive: true, dereference: false, verbatimSymlinks: true });
  if (scanTree(prepared).special.length)
    return { ...plan, blockers: ['the upstream folder contains symlinks or special files'] };
  const modifications: Release['modifications'] = [];
  const inFolder = scanTree(prepared).files.find(
    (f) => !f.path.includes('/') && LICENSE_NAME.test(f.path) && /^licen/i.test(f.path),
  );
  const rootLicense = got.root.find((p) => /^licen/i.test(basename(p)) && kindOf(p) === 'file');
  const licenseText = inFolder
    ? readFileSync(join(prepared, inFolder.path), 'utf8')
    : rootLicense
      ? readFileSync(rootLicense, 'utf8')
      : undefined;
  const detected = licenseText ? detectLicense(licenseText) : undefined;
  if (!licenseText)
    plan.blockers.push(
      'no licence file in the skill folder or at the repository root at this revision',
    );
  else if (!detected)
    plan.blockers.push(
      'the licence text was not recognised; review it by hand before preparing a release',
    );
  else if (detected !== skill.license)
    plan.blockers.push(
      `licence changed: the registry says ${skill.license}, upstream now has ${detected}; review before preparing`,
    );
  if (!inFolder && rootLicense) {
    copyFileSync(rootLicense, join(prepared, 'LICENSE'));
    modifications.push({
      kind: 'added',
      path: 'LICENSE',
      summary:
        'Added the upstream licence text, copied unchanged from the repository root at this revision.',
      why: 'The licence notice must accompany copies; the upstream skill folder does not contain it.',
      affectsBehavior: false,
      affectsDependencies: false,
      affectsPermissions: false,
    });
  }
  const author = skill.author ?? 'the original author';
  writeFileSync(
    join(prepared, 'ATTRIBUTION.md'),
    `# Attribution\n\nThis folder is a curated copy of the \`${skill.id}\` skill, kept in the Ecosystem Skills curated library.\n\n- Original work: \`${skill.id}\` by ${author}\n- Upstream repository: ${skill.source.upstream.url}\n- Upstream folder: \`${skill.source.path}\`\n- Upstream commit: \`${revision}\`\n- Upstream folder content hash: \`${upstreamHash}\`\n- Upstream licence: ${detected ?? 'unknown'}\n\nThis copy is maintained by Ecosystem Skills as library release ${opts.version}. It is not endorsed by the original author.\n`,
  );
  modifications.push({
    kind: 'added',
    path: 'ATTRIBUTION.md',
    summary:
      'Added an attribution file naming the author, upstream repository, folder, commit, folder hash and licence.',
    why: 'Keeps provenance next to the content.',
    affectsBehavior: false,
    affectsDependencies: false,
    affectsPermissions: false,
  });
  const curatedHash = scanTree(prepared).hash;
  plan.files = scanTree(prepared).files.map((f) => f.path);
  plan.prepared = prepared;
  const previous = existing.find((r) => r.approval.status === 'approved');
  if (previous)
    plan.notes.push(
      `${previous.version} is approved; ${opts.version} does NOT inherit that approval or its review`,
    );
  // Links that leave the folder would be broken once installed alone: declare them, unresolved (ES22).
  const refs = outOfFolderReferences(prepared);
  for (const r of refs)
    plan.notes.push(
      `${r.path}:${r.line} links outside the folder (${r.target}); recorded as unresolved, which blocks approval until it is resolved`,
    );
  plan.record = {
    skill: skill.id,
    version: opts.version,
    createdAt: (opts.now ?? (() => new Date()))().toISOString().slice(0, 10),
    path: `library/${skill.id}/${opts.version}`,
    upstream: {
      url: skill.source.upstream.url,
      path: skill.source.path,
      revision,
      contentHash: upstreamHash,
    },
    curatedHash,
    license: detected ?? skill.license ?? 'unknown',
    attribution: `${author} (${skill.source.upstream.url.replace('https://github.com/', '')}), ${detected ?? skill.license}.`,
    modifications,
    references: refs.map((r) => ({
      path: r.path,
      target: r.target,
      resolution: 'unresolved' as const,
      note: `Found at preparation (line ${r.line}). Resolve by curating the sibling skill and declaring requires-release, or by a declared modification of the link.`,
    })),
    review: { outcome: 'not-evaluated', checks: [], evidence: [] },
    approval: { status: 'unapproved' },
    supportedAgents: [],
    dependencies: [],
    restrictions: [
      `Prepared from upstream ${revision.slice(0, 12)}. It does not inherit the review or approval of any earlier version or of the discovery record.`,
    ],
  };
  return plan;
}

/** Stage the prepared folder into library/ and append the unapproved record, all or nothing. */
export function applyPrepare(
  root: string,
  plan: PreparePlan,
  /** `releases` is the text the plan was computed from, or undefined when registry/releases.json does not exist yet. */
  registryText: { releases: string | undefined; raw: Record<string, unknown> },
): string {
  if (plan.blockers.length || !plan.record || !plan.prepared)
    throw new LibraryError(`refused: ${plan.blockers.join('; ') || 'nothing prepared'}`);
  const releases = [...((registryText.raw.releases as unknown[]) ?? []), plan.record];
  const check = buildCatalog({ ...registryText.raw, releases });
  if (!check.ok)
    throw new LibraryError(
      `the new record would make the registry invalid:\n  - ${check.errors.join('\n  - ')}`,
    );
  const staged = stageRelease(root, {
    skill: plan.skill,
    version: plan.version,
    from: plan.prepared,
  });
  try {
    if (staged.hash !== plan.record.curatedHash)
      throw new LibraryError('staged content does not match the prepared hash');
    const file = join(root, 'registry', 'releases.json');
    if (registryText.releases === undefined && existsSync(file))
      throw new LibraryError(
        'registry/releases.json appeared while this command was running; nothing was written',
      );
    writeFileAtomic(
      file,
      formatJson(releases),
      registryText.releases === undefined ? {} : { expectedCurrent: registryText.releases },
    );
  } catch (e) {
    rmSync(join(root, staged.path), { recursive: true, force: true });
    throw e;
  }
  return staged.path;
}

export function cleanupPlan(plan: PreparePlan): void {
  for (const d of plan.cleanup) rmSync(d, { recursive: true, force: true });
}
