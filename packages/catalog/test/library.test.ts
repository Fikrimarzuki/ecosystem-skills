import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  checkReleaseHistory,
  compareTrees,
  contentAvailability,
  releaseInstallBlocker,
  releaseInstallProblems,
  REVIEW_CATEGORIES,
  stageRelease,
  undeclaredDifferences,
  verifyLibrary,
  verifyRelease,
  type Release,
  type Skill,
} from '../src/index.ts';
import { findConsumer, loadRegistry } from '../src/consumers.ts';
import { planSync } from '../src/sync.ts';
import { scanTree } from '../src/tree.ts';
import { makeRepo, SHA, tmp, write } from './fixtures.ts';

/* ES17: hybrid library. Content availability, release records, library files, immutability, install restrictions. */
const UP = 'https://github.com/org/repo';
const H = (c: string) => `sha256-${c.repeat(64)}`;
const FILES = {
  'SKILL.md': '---\nname: cand\n---\nbody\n',
  LICENSE: 'MIT License\n',
  'ATTRIBUTION.md': '# Attribution\n',
};

const skill = (over: Record<string, unknown> = {}) => ({
  id: 'cand',
  name: 'Cand',
  description: 'd',
  category: 'general',
  origin: 'external',
  source: { type: 'external', upstream: { url: UP }, path: 'skills/cand', revision: SHA },
  author: 'Org',
  license: 'MIT',
  review: { status: 'unreviewed', findings: [] },
  ...over,
});
const modification = (path = 'LICENSE') => ({
  kind: 'added',
  path,
  summary: 's',
  why: 'w',
  affectsBehavior: false,
  affectsDependencies: false,
  affectsPermissions: false,
});
const fullChecks = () =>
  REVIEW_CATEGORIES.flatMap((category) =>
    (['instructions', 'supporting-files'] as const).map((scope) => ({
      category,
      scope,
      result: 'no-issue-found',
    })),
  );
const goodReview = () => ({
  outcome: 'no-blocking-issues',
  reviewer: 'Owner',
  reviewedAt: '2026-10-31',
  scope: 'every file of the folder, read by hand',
  contentHash: H('b'),
  checks: fullChecks(),
  evidence: [{ method: 'manual-read', summary: 'read SKILL.md and all references' }],
});
const release = (over: Record<string, unknown> = {}) => ({
  skill: 'cand',
  version: '1.0.0',
  createdAt: '2026-10-30',
  path: 'library/cand/1.0.0',
  upstream: { url: UP, path: 'skills/cand', revision: SHA, contentHash: H('a') },
  curatedHash: H('b'),
  license: 'MIT',
  attribution: 'Org, MIT',
  modifications: [modification()],
  ...over,
});
const reg = (skills: unknown[], releases: unknown[], over: Record<string, unknown> = {}) => ({
  skills,
  consumers: [],
  integrations: [],
  releases,
  ...over,
});
const errors = (raw: unknown) => {
  const r = buildCatalog(raw);
  return r.ok ? '' : r.errors.join('\n');
};
const catalogOf = (skills: unknown[], releases: unknown[]) => {
  const r = buildCatalog(reg(skills, releases));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.catalog;
};
const approvedRelease = (over: Record<string, unknown> = {}) =>
  release({
    review: goodReview(),
    approval: { status: 'approved', approvedBy: 'Owner', approvedAt: '2026-10-31' },
    ...over,
  });

describe('content availability (derived, separate from review and approval)', () => {
  const state = (s: Record<string, unknown>, releases: unknown[] = []) => {
    const c = catalogOf([skill(s)], releases);
    return contentAvailability(c.skills[0] as Skill, c.releases);
  };

  it('a registered skill without a release is a source reference, with its reasons, and no version', () => {
    const a = state({});
    expect(a.state).toBe('source-only');
    expect(a.release).toBeUndefined();
    expect(a.reasons.map((r) => r.code)).toEqual(['awaiting-review']);
  });

  it('explains reviewed, rejected and approved-upstream-only skills differently', () => {
    const rev = (status: string) => ({
      review: {
        status,
        reviewedAt: '2026-10-30',
        reviewer: 'r',
        revision: SHA,
        contentHash: H('a'),
        findings: [],
        ...(status === 'approved' ? { approvedBy: 'o' } : {}),
      },
    });
    expect(state(rev('reviewed')).reasons[0]!.code).toBe('reviewed-not-approved');
    expect(state(rev('approved')).reasons[0]!.code).toBe('approved-upstream-only');
    expect(state(rev('rejected')).reasons[0]!.code).toBe('rejected');
  });

  it('surfaces approval blockers and warnings as reasons', () => {
    const d = {
      discoveredAt: '2026-10-30',
      outcome: 'register-with-warnings',
      source: 'x',
      contentHash: H('a'),
      warnings: ['w'],
      approvalBlockers: ['b'],
      audit: 'a',
    };
    const c = buildCatalog({
      skills: [skill({ discovery: d })],
      consumers: [],
      integrations: [],
      sources: [
        {
          id: 'x',
          name: 'x',
          batch: 'discovered',
          kind: 'skill',
          resolution: 'verified',
          decision: 'register-with-warnings',
          upstream: { url: UP },
          revision: SHA,
          skills: ['cand'],
          summary: 's',
          discoveredAt: '2026-10-30',
        },
      ],
    });
    if (!c.ok) throw new Error(c.errors.join());
    const codes = contentAvailability(c.catalog.skills[0] as Skill, []).reasons.map((r) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining(['awaiting-review', 'approval-blocker', 'has-warnings']),
    );
  });

  it('blocks curation for an unknown licence, a repository-root skill, or an owner note; pending is explicit', () => {
    expect(state({ license: 'unknown' }).state).toBe('curation-blocked');
    expect(
      state({
        source: { type: 'external', upstream: { url: UP }, path: '.', revision: SHA },
      }).reasons.map((r) => r.code),
    ).toContain('root-level');
    expect(
      state({
        curation: { state: 'blocked', reason: 'redistribution refused', updatedAt: '2026-10-30' },
      }).state,
    ).toBe('curation-blocked');
    expect(
      state({ curation: { state: 'pending', reason: 'selected', updatedAt: '2026-10-30' } }).state,
    ).toBe('curation-pending');
  });

  it('a first-party skill is kept in this repository and is not curated', () => {
    const fp = {
      id: 'fp',
      name: 'F',
      description: 'd',
      category: 'general',
      origin: 'first-party',
      source: { type: 'first-party', path: 'skills/shared/fp' },
    };
    const c = catalogOf([fp], []);
    expect(contentAvailability(c.skills[0] as Skill, c.releases).state).toBe('first-party');
    expect(
      errors(
        reg([{ ...fp, curation: { state: 'pending', reason: 'r', updatedAt: '2026-10-30' } }], []),
      ),
    ).toMatch(/first-party skills are not curated/);
  });

  it('a local release never changes review status: curated-unapproved and curated-approved are about the release only', () => {
    expect(state({}, [release()]).state).toBe('curated-unapproved');
    const a = state({}, [approvedRelease()]);
    expect(a.state).toBe('curated-approved');
    expect(catalogOf([skill()], [approvedRelease()]).skills[0]!.review.status).toBe('unreviewed');
  });

  it('prefers the newest approved release and sorts versions numerically', () => {
    const rs = [
      release({ version: '1.9.0', path: 'library/cand/1.9.0' }),
      release({ version: '1.10.0', path: 'library/cand/1.10.0' }),
    ];
    const a = state({}, rs);
    expect(a.releases.map((r) => r.version)).toEqual(['1.10.0', '1.9.0']);
    expect(a.release!.version).toBe('1.10.0');
  });
});

describe('release validation', () => {
  it('accepts a complete unapproved release and keeps review not-evaluated by default', () => {
    expect(errors(reg([skill()], [release()]))).toBe('');
    expect(catalogOf([skill()], [release()]).releases[0]!.review.outcome).toBe('not-evaluated');
  });

  it('requires unique versions per skill, semantic versions and the canonical content path', () => {
    expect(errors(reg([skill()], [release(), release()]))).toMatch(
      /duplicate version for this skill/,
    );
    expect(errors(reg([skill()], [release({ version: '1.0' })]))).toMatch(/semantic version/);
    expect(errors(reg([skill()], [release({ path: 'library/other/1.0.0' })]))).toMatch(
      /path must be library\/cand\/1.0.0/,
    );
    for (const path of ['../x', '/abs/x', 'library//x'])
      expect(errors(reg([skill()], [release({ path })])), path).toMatch(/path/);
  });

  it('requires provenance: upstream matching the registered source, a known licence and an attribution', () => {
    expect(errors(reg([skill()], [release({ upstream: undefined })]))).toMatch(
      /must record its upstream/,
    );
    expect(
      errors(
        reg(
          [skill()],
          [
            release({
              upstream: {
                url: 'https://github.com/other/repo',
                path: 'skills/cand',
                revision: SHA,
                contentHash: H('a'),
              },
            }),
          ],
        ),
      ),
    ).toMatch(/does not match the skill's registered source/);
    expect(errors(reg([skill()], [release({ license: 'unknown' })]))).toMatch(/known licence/);
    expect(errors(reg([skill()], [release({ attribution: undefined })]))).toMatch(/attribution/);
    expect(
      errors(
        reg(
          [skill()],
          [
            release({
              upstream: { url: UP, path: 'skills/cand', revision: 'main', contentHash: H('a') },
            }),
          ],
        ),
      ),
    ).toMatch(/full 40-character/);
    expect(errors(reg([skill()], [release({ curatedHash: 'abc' })]))).toMatch(/sha256-/);
  });

  it('modified content cannot pass as unchanged, and unchanged content has no modifications', () => {
    expect(errors(reg([skill()], [release({ modifications: [] })]))).toMatch(
      /hash differs from the upstream hash, so the modifications must be listed/,
    );
    expect(errors(reg([skill()], [release({ curatedHash: H('a') })]))).toMatch(
      /lists modifications although the curated hash equals/,
    );
    expect(errors(reg([skill()], [release({ curatedHash: H('a'), modifications: [] })]))).toBe('');
    expect(
      errors(reg([skill()], [release({ modifications: [modification(), modification()] })])),
    ).toMatch(/listed more than once/);
  });

  it('refuses a release for a skill whose curation is blocked (unknown licence, root-level)', () => {
    expect(errors(reg([skill({ license: 'unknown' })], [release()]))).toMatch(
      /curation is blocked.*license-unknown/,
    );
    expect(
      errors(
        reg(
          [
            skill({
              source: { type: 'external', upstream: { url: UP }, path: '.', revision: SHA },
            }),
          ],
          [release({ upstream: { url: UP, path: '.', revision: SHA, contentHash: H('a') } })],
        ),
      ),
    ).toMatch(/curation is blocked.*root-level/);
    expect(
      errors(
        reg(
          [skill({ curation: { state: 'pending', reason: 'r', updatedAt: '2026-10-30' } })],
          [release()],
        ),
      ),
    ).toMatch(/curation" records intent for a skill without a release/);
  });

  it('refuses a release for an unknown skill', () => {
    expect(errors(reg([], [release()]))).toMatch(/unknown skill "cand"/);
  });
});

describe('security review and release approval stay separate', () => {
  it('"no blocking issues" needs every category in both scopes, a reviewer, a scope and manual reading', () => {
    expect(errors(reg([skill()], [approvedRelease()]))).toBe('');
    expect(
      errors(
        reg([skill()], [release({ review: { ...goodReview(), checks: fullChecks().slice(1) } })]),
      ),
    ).toMatch(/requires prompt-injection \/ instructions/);
    expect(
      errors(
        reg(
          [skill()],
          [
            release({
              review: {
                ...goodReview(),
                evidence: [{ method: 'static-scan', summary: 'scanner' }],
              },
            }),
          ],
        ),
      ),
    ).toMatch(/requires manual-read evidence; a static scan alone is not a review/);
    expect(
      errors(reg([skill()], [release({ review: { ...goodReview(), reviewer: undefined } })])),
    ).toMatch(/requires reviewer, reviewedAt and scope/);
    expect(
      errors(
        reg(
          [skill()],
          [
            release({
              review: {
                ...goodReview(),
                checks: [
                  ...fullChecks(),
                  { category: 'hooks', scope: 'instructions', result: 'issue-found' },
                ],
              },
            }),
          ],
        ),
      ),
    ).toMatch(/contradicts a recorded issue/);
  });

  it('other outcomes must record what they claim; not-evaluated records nothing', () => {
    const base = {
      reviewer: 'r',
      reviewedAt: '2026-10-31',
      scope: 's',
      evidence: [{ method: 'manual-read', summary: 'x' }],
      checks: [],
    };
    expect(
      errors(reg([skill()], [release({ review: { ...base, outcome: 'requires-changes' } })])),
    ).toMatch(/at least one issue-found/);
    expect(
      errors(reg([skill()], [release({ review: { ...base, outcome: 'requires-manual-review' } })])),
    ).toMatch(/at least one needs-manual-review/);
    expect(
      errors(
        reg(
          [skill()],
          [
            release({
              review: {
                ...base,
                outcome: 'blocked',
                checks: [{ category: 'hooks', scope: 'instructions', result: 'issue-found' }],
              },
            }),
          ],
        ),
      ),
    ).toMatch(/notes/);
    expect(
      errors(
        reg(
          [skill()],
          [
            release({
              review: {
                outcome: 'not-evaluated',
                evidence: [{ method: 'static-scan', summary: 'x' }],
              },
            }),
          ],
        ),
      ),
    ).toMatch(/not-evaluated but it records evidence/);
  });

  it('a release cannot be approved without a complete review, an approver, or while the skill is blocked or rejected', () => {
    const ap = { status: 'approved', approvedBy: 'Owner', approvedAt: '2026-10-31' };
    expect(errors(reg([skill()], [release({ approval: ap })]))).toMatch(
      /approved, but the security review outcome is "not-evaluated"/,
    );
    expect(errors(reg([skill()], [approvedRelease({ approval: { status: 'approved' } })]))).toMatch(
      /requires approvedBy and approvedAt/,
    );
    expect(
      errors(reg([skill()], [release({ approval: { status: 'unapproved', approvedBy: 'x' } })])),
    ).toMatch(/cannot carry approvedBy/);
    const d = {
      discoveredAt: '2026-10-30',
      outcome: 'register-with-warnings',
      source: 'x',
      contentHash: H('a'),
      warnings: ['w'],
      approvalBlockers: ['licence unconfirmed'],
      audit: 'a',
    };
    const src = {
      id: 'x',
      name: 'x',
      batch: 'discovered',
      kind: 'skill',
      resolution: 'verified',
      decision: 'register-with-warnings',
      upstream: { url: UP },
      revision: SHA,
      skills: ['cand'],
      summary: 's',
      discoveredAt: '2026-10-30',
    };
    expect(
      errors({ ...reg([skill({ discovery: d })], [approvedRelease()]), sources: [src] }),
    ).toMatch(/unresolved approval blocker: licence unconfirmed/);
    const rejected = skill({
      review: { status: 'rejected', reviewedAt: '2026-10-30', reviewer: 'r', findings: [] },
    });
    expect(errors(reg([rejected], [approvedRelease()]))).toMatch(/the skill is rejected/);
  });

  it('install eligibility needs approval AND a clean review AND no blockers, and says why not', () => {
    const c = catalogOf([skill()], [approvedRelease()]);
    const s = c.skills[0] as Skill;
    expect(releaseInstallBlocker(s, c.releases[0]!)).toBeUndefined();
    const unapproved = catalogOf([skill()], [release()]);
    const why = releaseInstallBlocker(unapproved.skills[0] as Skill, unapproved.releases[0]!);
    expect(why).toMatch(
      /cand@1.0.0 cannot be installed from the curated library: the release is not approved; its security review has not recorded/,
    );
    // a record that bypassed validation is still refused
    const forged = {
      ...unapproved.releases[0]!,
      approval: { status: 'approved' as const, approvedBy: 'x', approvedAt: '2026-10-31' },
    } as Release;
    expect(
      releaseInstallProblems(unapproved.skills[0] as Skill, forged).map((p) => p.code),
    ).toEqual(['review-incomplete']);
    const lic = { ...s, license: 'unknown' } as Skill;
    expect(releaseInstallProblems(lic, c.releases[0]!).map((p) => p.code)).toContain(
      'license-unknown',
    );
  });
});

describe('library files: verification, immutability and safe staging (isolated fixtures)', () => {
  function library(files: Record<string, string> = FILES, version = '1.0.0') {
    const root = tmp('es-lib-');
    const dir = join(root, 'library/cand', version);
    for (const [n, b] of Object.entries(files)) write(join(dir, n), b);
    const rel = release({
      version,
      path: `library/cand/${version}`,
      curatedHash: scanTree(dir).hash,
    }) as unknown as Release;
    return { root, dir, rel };
  }
  const cat = (rels: Release[]) => ({ releases: rels });

  it('accepts a folder that matches its record and carries the licence and attribution', () => {
    const { root, rel } = library();
    expect(verifyRelease(root, rel)).toEqual([]);
    expect(verifyLibrary(root, cat([rel]))).toEqual([]);
  });

  it('detects any change to a release folder (edit, add, delete) as a hash mismatch', () => {
    for (const mutate of [
      (d: string) => writeFileSync(join(d, 'SKILL.md'), 'tampered'),
      (d: string) => writeFileSync(join(d, 'extra.md'), 'x'),
      (d: string) => writeFileSync(join(d, 'LICENSE'), 'MIT License\nedited\n'),
    ]) {
      const { root, dir, rel } = library();
      mutate(dir);
      expect(verifyRelease(root, rel).join()).toMatch(/does not match the recorded/);
    }
  });

  it('reports a missing folder, SKILL.md, licence notice or attribution', () => {
    const { root, rel } = library();
    expect(
      verifyRelease(root, {
        ...rel,
        version: '9.9.9',
        path: 'library/cand/9.9.9',
      } as Release).join(),
    ).toMatch(/is missing/);
    const noLic = library({ 'SKILL.md': FILES['SKILL.md'], 'ATTRIBUTION.md': 'a' });
    expect(verifyRelease(noLic.root, noLic.rel).join()).toMatch(/no LICENSE file/);
    const noAttr = library({ 'SKILL.md': FILES['SKILL.md'], LICENSE: 'MIT' });
    expect(verifyRelease(noAttr.root, noAttr.rel).join()).toMatch(/no ATTRIBUTION.md/);
    const noSkill = library({ LICENSE: 'MIT', 'ATTRIBUTION.md': 'a' });
    expect(verifyRelease(noSkill.root, noSkill.rel).join()).toMatch(/no SKILL.md/);
  });

  it('rejects symlinks inside a release and symlinked release, skill or library directories', () => {
    const inner = library();
    symlinkSync('/etc/hosts', join(inner.dir, 'escape'));
    expect(verifyRelease(inner.root, inner.rel).join()).toMatch(
      /symlinks or special files: escape/,
    );

    const real = library();
    const outside = tmp('es-outside-');
    cpSync(real.dir, join(outside, '1.0.0'), { recursive: true });
    const root = tmp('es-lib-sym-');
    mkdirSync(join(root, 'library'));
    symlinkSync(outside, join(root, 'library/cand'));
    expect(verifyRelease(root, real.rel).join()).toMatch(/is a symlink, not a plain directory/);

    const root2 = tmp('es-lib-sym2-');
    symlinkSync(outside, join(root2, 'library'));
    expect(verifyRelease(root2, real.rel).join()).toMatch(/library is a symlink/);
  });

  it('flags untracked release folders and stray entries in library/', () => {
    const { root, rel } = library();
    mkdirSync(join(root, 'library/cand/2.0.0'));
    writeFileSync(join(root, 'library/stray.txt'), 'x');
    mkdirSync(join(root, 'library/other/1.0.0'), { recursive: true });
    mkdirSync(join(root, 'library/cand/notasemver'));
    const p = verifyLibrary(root, cat([rel])).join('\n');
    expect(p).toMatch(/untracked release folder library\/cand\/2.0.0/);
    expect(p).toMatch(/untracked release folder library\/other\/1.0.0/);
    expect(p).toMatch(/unexpected entry library\/stray.txt/);
    expect(p).toMatch(/unexpected entry library\/cand\/notasemver/);
  });

  it('stages a prepared folder atomically, hash-identical, leaving no temporary folder', () => {
    const root = tmp('es-stage-root-');
    const from = tmp('es-stage-from-');
    for (const [n, b] of Object.entries(FILES)) write(join(from, n), b);
    const r = stageRelease(root, { skill: 'cand', version: '1.2.3', from });
    expect(r.path).toBe('library/cand/1.2.3');
    expect(r.hash).toBe(scanTree(from).hash);
    expect(scanTree(join(root, r.path)).hash).toBe(r.hash);
    expect(readdirSync(join(root, 'library'))).toEqual(['cand']);
  });

  it('never overwrites a version, and refuses unsafe sources and malformed names without writing anything', () => {
    const root = tmp('es-stage-root2-');
    const from = tmp('es-stage-from2-');
    for (const [n, b] of Object.entries(FILES)) write(join(from, n), b);
    stageRelease(root, { skill: 'cand', version: '1.0.0', from });
    const before = scanTree(join(root, 'library/cand/1.0.0')).hash;
    write(join(from, 'SKILL.md'), 'changed upstream');
    expect(() => stageRelease(root, { skill: 'cand', version: '1.0.0', from })).toThrow(
      /already exists; releases are immutable/,
    );
    expect(scanTree(join(root, 'library/cand/1.0.0')).hash).toBe(before);

    const linked = tmp('es-stage-link-');
    write(join(linked, 'SKILL.md'), 'x');
    symlinkSync('/etc/hosts', join(linked, 'escape'));
    expect(() => stageRelease(root, { skill: 'cand', version: '2.0.0', from: linked })).toThrow(
      /symlinks or special files/,
    );
    expect(() =>
      stageRelease(root, { skill: 'cand', version: '2.0.0', from: tmp('es-empty-') }),
    ).toThrow(/no SKILL.md/);
    expect(() => stageRelease(root, { skill: 'cand', version: 'v2', from })).toThrow(
      /semantic version/,
    );
    expect(() => stageRelease(root, { skill: '../evil', version: '2.0.0', from })).toThrow(
      /unsafe skill id/,
    );
    expect(() =>
      stageRelease(root, { skill: 'cand', version: '2.0.0', from: join(from, 'SKILL.md') }),
    ).toThrow(/not a plain directory/);
    expect(readdirSync(join(root, 'library')).sort()).toEqual(['cand']);
    expect(readdirSync(join(root, 'library/cand'))).toEqual(['1.0.0']);
  });

  it('refuses to stage through a symlinked library directory', () => {
    const root = tmp('es-stage-root3-');
    const outside = tmp('es-stage-out-');
    symlinkSync(outside, join(root, 'library'));
    const from = tmp('es-stage-from3-');
    for (const [n, b] of Object.entries(FILES)) write(join(from, n), b);
    expect(() => stageRelease(root, { skill: 'cand', version: '1.0.0', from })).toThrow(
      /not a plain directory/,
    );
    expect(readdirSync(outside)).toEqual([]);
  });
});

describe('comparison with upstream and release history', () => {
  const scanOf = (files: Record<string, string>) => {
    const d = tmp('es-cmp-');
    for (const [n, b] of Object.entries(files)) write(join(d, n), b);
    return scanTree(d);
  };

  it('lists added, removed, changed and identical files', () => {
    const up = scanOf({ 'SKILL.md': 'a', 'old.md': 'x', 'same.md': 's' });
    const cur = scanOf({ 'SKILL.md': 'b', 'same.md': 's', LICENSE: 'l' });
    expect(compareTrees(up, cur)).toEqual({
      added: ['LICENSE'],
      removed: ['old.md'],
      changed: ['SKILL.md'],
      unchanged: ['same.md'],
    });
  });

  it('flags differences the release does not declare, and declared ones that are not there', () => {
    const rel = release({ modifications: [modification('LICENSE')] }) as unknown as Release;
    expect(
      undeclaredDifferences({ added: ['LICENSE'], removed: [], changed: [], unchanged: [] }, rel),
    ).toEqual([]);
    expect(
      undeclaredDifferences(
        { added: ['LICENSE'], removed: [], changed: ['SKILL.md'], unchanged: [] },
        rel,
      ),
    ).toEqual(['changed SKILL.md is not declared in the release modifications']);
    expect(
      undeclaredDifferences({ added: [], removed: [], changed: [], unchanged: [] }, rel)[0],
    ).toMatch(/declared but the trees do not show it/);
  });

  it('releases are append-only; approved releases are frozen; content changes need a new version', () => {
    const r = catalogOf([skill()], [release()]).releases;
    expect(checkReleaseHistory(r, r)).toEqual([]);
    expect(checkReleaseHistory(r, [])[0]).toMatch(/release was removed; withdraw it instead/);
    const edited = [{ ...r[0]!, curatedHash: H('c') }];
    expect(checkReleaseHistory(r, edited)[0]).toMatch(
      /"curatedHash" of an existing release must not change/,
    );
    expect(
      checkReleaseHistory(r, [...r, { ...r[0]!, version: '1.0.1', path: 'library/cand/1.0.1' }]),
    ).toEqual([]);

    const ap = catalogOf([skill()], [approvedRelease()]).releases;
    expect(checkReleaseHistory(ap, [{ ...ap[0]!, dependencies: ['new'] }])[0]).toMatch(
      /"dependencies" of an approved release is immutable/,
    );
    expect(
      checkReleaseHistory(ap, [{ ...ap[0]!, approval: { status: 'unapproved' as const } }]).join(),
    ).toMatch(/cannot return to unapproved; withdraw it/);
    expect(
      checkReleaseHistory(ap, [
        { ...ap[0]!, approval: { ...ap[0]!.approval, status: 'withdrawn' as const } },
      ]),
    ).toEqual([]);
    // an unapproved release may still be reviewed and approved later
    const later = catalogOf([skill()], [approvedRelease()]).releases;
    expect(checkReleaseHistory(r, later)).toEqual([]);
  });
});

describe('installation boundaries (no new install path; legacy path preserved)', () => {
  it('sync never falls back to library/: an approved skill with a release but no install is still "not installed"', () => {
    const { root, project } = makeRepo();
    // put a (complete, even approved-looking) copy of the skill in library/
    for (const [n, b] of Object.entries(FILES)) write(join(root, 'library/absent/1.0.0', n), b);
    const reg = loadRegistry(root);
    const consumer = {
      ...findConsumer(reg, 'proj'),
      assignments: [
        {
          skill: 'absent',
          agents: ['claude-code' as const],
          install: 'symlink' as const,
          verification: { status: 'unverified' as const },
        },
      ],
    };
    const plan = planSync(root, reg.catalog, consumer, project);
    expect(plan.blockers.map((b) => b.detail).join(' ')).toMatch(
      /not installed \(run pnpm skills:install absent\)/,
    );
    expect(existsSync(join(project, '.claude'))).toBe(false);
  });

  it('the installer and sync sources never read the library directory', () => {
    for (const f of ['install.ts', 'sync.ts', 'links.ts']) {
      const src = readFileSync(join(__dirname, '../src', f), 'utf8');
      expect(src, f).not.toMatch(/['"`]library['"`]|LIBRARY_DIR|library\//);
    }
  });
});

describe('cli (real cli.ts in a disposable repository)', () => {
  const pkg = resolve(__dirname, '..');
  const TSX = join(pkg, 'node_modules/tsx/dist/cli.mjs');
  function cliRepo() {
    const r = makeRepo();
    cpSync(join(pkg, 'src'), join(r.root, 'packages/catalog/src'), { recursive: true });
    cpSync(join(pkg, 'package.json'), join(r.root, 'packages/catalog/package.json'));
    symlinkSync(join(pkg, 'node_modules'), join(r.root, 'packages/catalog/node_modules'));
    for (const [n, b] of Object.entries(FILES)) write(join(r.root, 'library/pending/1.0.0', n), b);
    const hash = scanTree(join(r.root, 'library/pending/1.0.0')).hash;
    const skills = JSON.parse(readFileSync(join(r.root, 'registry/skills.json'), 'utf8'));
    const pending = skills.find((s: { id: string }) => s.id === 'pending');
    write(
      join(r.root, 'registry/releases.json'),
      JSON.stringify([
        release({
          skill: 'pending',
          path: 'library/pending/1.0.0',
          curatedHash: hash,
          upstream: {
            url: pending.source.upstream.url,
            path: pending.source.path,
            revision: SHA,
            contentHash: H('a'),
          },
          license: 'MIT',
        }),
      ]),
    );
    return r;
  }
  const run = (root: string, ...args: string[]) =>
    spawnSync(process.execPath, [TSX, join(root, 'packages/catalog/src/cli.ts'), ...args], {
      cwd: join(root, 'packages/catalog'),
      env: { ...process.env, INIT_CWD: root },
      encoding: 'utf8',
    });

  it('list, verify and validate accept a matching library; a tampered release fails both verify and validate', () => {
    const { root } = cliRepo();
    expect(run(root, 'library', 'list').stdout).toMatch(
      /pending@1.0.0\s+release: unapproved\s+review: not-evaluated\s+not installable from the library/,
    );
    expect(run(root, 'library', 'verify').status).toBe(0);
    expect(run(root, 'validate').status).toBe(0);
    writeFileSync(join(root, 'library/pending/1.0.0/SKILL.md'), 'tampered');
    const v = run(root, 'library', 'verify');
    expect(v.status).toBe(1);
    expect(v.stderr).toMatch(/does not match the recorded/);
    const val = run(root, 'validate');
    expect(val.status).toBe(1);
    expect(val.stderr).toMatch(/Library invalid/);
  }, 60_000);

  it('stage refuses an existing version, writes content only, and malformed use exits before touching anything', () => {
    const { root } = cliRepo();
    const from = tmp('es-cli-from-');
    for (const [n, b] of Object.entries(FILES)) write(join(from, n), b);
    const dup = run(root, 'library', 'stage', 'pending', '1.0.0', '--from', from);
    expect(dup.status).toBe(1);
    expect(dup.stderr).toMatch(/already exists; releases are immutable/);
    const ok = run(root, 'library', 'stage', 'pending', '1.0.1', '--from', from);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/not approved and cannot be installed/);
    expect(existsSync(join(root, 'registry/releases.json'))).toBe(true);
    expect(readFileSync(join(root, 'registry/releases.json'), 'utf8')).not.toMatch(/1\.0\.1/); // no registry write
    expect(run(root, 'library', 'stage', 'pending').status).toBe(2);
    expect(run(root, 'library', 'nonsense').status).toBe(2);
  }, 60_000);

  it('compare against a local upstream folder reports declared and undeclared differences', () => {
    const { root } = cliRepo();
    // upstream = the curated folder minus the two added files, so only declared additions would exist... but the record declares only LICENSE
    const up = tmp('es-cli-up-');
    write(join(up, 'SKILL.md'), FILES['SKILL.md']);
    const r = run(root, 'library', 'compare', 'pending', '--upstream-dir', up);
    expect(r.status).toBe(1); // recorded upstream hash is a placeholder, and ATTRIBUTION.md is undeclared
    expect(r.stderr).toMatch(/added ATTRIBUTION.md is not declared/);
  }, 60_000);
});
