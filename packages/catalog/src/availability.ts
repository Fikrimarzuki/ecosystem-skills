import type { Release, Skill } from './schema.ts';

/*
 * Pure (no filesystem) rules shared by the CLI, the validator and the website.
 *
 * Content availability answers one question: is there a local, curated copy of this skill? It is deliberately
 * separate from review status (is the skill approved?), the security review of a release, release approval, and
 * installation. The existence of a local file never implies any of those.
 */

export type ContentState =
  | 'first-party'
  | 'source-only'
  | 'curation-pending'
  | 'curated-unapproved'
  | 'curated-approved'
  | 'curation-blocked';

export type ReasonCode =
  | 'awaiting-review'
  | 'reviewed-not-approved'
  | 'approved-upstream-only'
  | 'rejected'
  | 'approval-blocker'
  | 'license-unknown'
  | 'root-level'
  | 'has-warnings'
  | 'curation-note';

export interface Reason {
  code: ReasonCode;
  detail?: string;
}

export interface Availability {
  state: ContentState;
  /** Why a skill without a usable curated release is in this state. Empty for curated skills. */
  reasons: Reason[];
  /** Releases of this skill, newest version first. */
  releases: Release[];
  /** The release the state is based on (the newest approved one, else the newest). */
  release?: Release;
}

const parse = (v: string) => v.split('.').map(Number) as [number, number, number];
export function compareVersions(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

export const releasesOf = (releases: Release[], skillId: string): Release[] =>
  releases.filter((r) => r.skill === skillId).sort((a, b) => compareVersions(b.version, a.version));

/** Conditions that make curating this skill pointless or unsafe, whatever the owner decides about approval. */
export function curationBlockers(skill: Skill): Reason[] {
  const out: Reason[] = [];
  const lic = (skill.license ?? '').trim().toLowerCase();
  if (skill.source.type === 'external' && (lic === '' || lic === 'unknown'))
    out.push({ code: 'license-unknown' });
  if (skill.source.type === 'external' && skill.source.path === '.')
    out.push({ code: 'root-level' });
  if (skill.curation?.state === 'blocked')
    out.push({ code: 'curation-note', detail: skill.curation.reason });
  return out;
}

/** The reasons shown for a skill that has no curated release. */
export function sourceOnlyReasons(skill: Skill): Reason[] {
  const out: Reason[] = [];
  const st = skill.review.status;
  if (st === 'unreviewed') out.push({ code: 'awaiting-review' });
  else if (st === 'reviewed') out.push({ code: 'reviewed-not-approved' });
  else if (st === 'approved') out.push({ code: 'approved-upstream-only' });
  else out.push({ code: 'rejected' });
  for (const b of skill.discovery?.approvalBlockers ?? [])
    out.push({ code: 'approval-blocker', detail: b });
  for (const r of curationBlockers(skill)) if (!out.some((o) => o.code === r.code)) out.push(r);
  if (skill.discovery && skill.discovery.warnings.length > 0 && st !== 'approved')
    out.push({ code: 'has-warnings', detail: String(skill.discovery.warnings.length) });
  if (skill.curation?.state === 'pending')
    out.push({ code: 'curation-note', detail: skill.curation.reason });
  return out;
}

export function contentAvailability(skill: Skill, allReleases: Release[]): Availability {
  const releases = releasesOf(allReleases, skill.id);
  if (skill.source.type === 'first-party') return { state: 'first-party', reasons: [], releases };
  const approved = releases.find((r) => r.approval.status === 'approved');
  if (approved) return { state: 'curated-approved', reasons: [], releases, release: approved };
  if (releases.length)
    return { state: 'curated-unapproved', reasons: [], releases, release: releases[0] };
  const reasons = sourceOnlyReasons(skill);
  if (curationBlockers(skill).length) return { state: 'curation-blocked', reasons, releases };
  if (skill.curation?.state === 'pending') return { state: 'curation-pending', reasons, releases };
  return { state: 'source-only', reasons, releases };
}

export interface InstallProblem {
  code:
    | 'release-not-approved'
    | 'review-incomplete'
    | 'skill-rejected'
    | 'approval-blocker'
    | 'license-unknown'
    | 'root-level';
  detail?: string;
}

/**
 * Why a curated release may not be installed from the library. Pure: it reads records only. A release is
 * installable only when it is approved *and* its security review recorded no blocking issues in a stated scope, the
 * skill is not rejected, and nothing in discovery still blocks approval. Content hashes are checked separately
 * against the files (library.ts) because that needs the filesystem.
 */
export function releaseInstallProblems(skill: Skill, release: Release): InstallProblem[] {
  const out: InstallProblem[] = [];
  if (release.approval.status !== 'approved')
    out.push({ code: 'release-not-approved', detail: release.approval.status });
  if (release.review.outcome !== 'no-blocking-issues')
    out.push({ code: 'review-incomplete', detail: release.review.outcome });
  if (skill.review.status === 'rejected') out.push({ code: 'skill-rejected' });
  for (const b of skill.discovery?.approvalBlockers ?? [])
    out.push({ code: 'approval-blocker', detail: b });
  for (const r of curationBlockers(skill))
    if (r.code === 'license-unknown' || r.code === 'root-level') out.push({ code: r.code });
  return out;
}

const MESSAGE: Record<InstallProblem['code'], string> = {
  'release-not-approved': 'the release is not approved',
  'review-incomplete':
    'its security review has not recorded "no blocking issues" for a stated scope',
  'skill-rejected': 'the skill is rejected',
  'approval-blocker': 'an approval blocker is unresolved',
  'license-unknown': 'the licence is unknown',
  'root-level': 'it is a repository-root skill',
};
export function releaseInstallBlocker(skill: Skill, release: Release): string | undefined {
  const p = releaseInstallProblems(skill, release);
  if (!p.length) return undefined;
  return `${skill.id}@${release.version} cannot be installed from the curated library: ${p
    .map(
      (x) =>
        MESSAGE[x.code] +
        (x.detail && x.code !== 'review-incomplete' && x.code !== 'release-not-approved'
          ? ` (${x.detail})`
          : ''),
    )
    .join('; ')}`;
}
