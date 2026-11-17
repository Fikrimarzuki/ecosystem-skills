import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  checkReleaseHistory,
  verifyLibrary,
  type Catalog,
  type Skill,
} from '../src/index.ts';
import { loadRegistry } from '../src/consumers.ts';
import { planCurated } from '../src/curated.ts';
import {
  applyPrepare,
  checkMany,
  checkSkill,
  classifyChanges,
  cleanupPlan,
  mergeChecks,
  preparePlan,
  RemoteError,
  type Remote,
} from '../src/upstream.ts';
import { scanTree } from '../src/tree.ts';
import { curatedRepo, readText } from './curatedfix.ts';
import { SHA, tmp, write } from './fixtures.ts';

/* ES20: upstream checks and release preparation, against a fake upstream (no network). */
const NEW = 'b'.repeat(40);
const dirOf = (files: Record<string, string>, exec: string[] = []) => {
  const d = tmp('es20-src-');
  for (const [f, b] of Object.entries(files)) write(join(d, f), b);
  for (const f of exec) chmodSync(join(d, f), 0o755);
  return d;
};
/** revisions: sha -> folder; head: url -> sha (or an error) */
function fakeRemote(
  revisions: Record<string, string | 'missing' | 'fail'>,
  head: string | RemoteError,
  rootLicense?: string,
) {
  const calls = { head: 0, folder: 0 };
  const remote: Remote = {
    async head() {
      calls.head++;
      if (head instanceof RemoteError) throw head;
      return head;
    },
    async folder(_url, revision, _path, staging) {
      calls.folder++;
      const src = revisions[revision];
      if (src === undefined || src === 'missing')
        throw new RemoteError(`archive has no folder at ${revision}`, 'missing');
      if (src === 'fail') throw new RemoteError('download failed: HTTP 503', 'failed');
      mkdirSync(staging, { recursive: true });
      const work = mkdtempSync(join(staging, 'w-'));
      cpSync(src, join(work, 'dir'), { recursive: true });
      const root: string[] = [];
      if (rootLicense) {
        writeFileSync(join(work, 'LICENSE'), rootLicense);
        root.push(join(work, 'LICENSE'));
      }
      return { work, dir: join(work, 'dir'), root };
    },
    async commitDate() {
      return '2026-10-29';
    },
  };
  return { remote, calls };
}
const MIT =
  'MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\n';
const skillOf = (status: 'unreviewed' | 'approved', hash?: string, over = {}) => {
  const raw = {
    id: 'cand',
    name: 'C',
    description: 'd',
    category: 'general',
    origin: 'external',
    source: {
      type: 'external',
      upstream: { url: 'https://github.com/o/r' },
      path: 'skills/cand',
      revision: SHA,
    },
    author: 'o',
    license: 'MIT',
    review:
      status === 'approved'
        ? {
            status,
            reviewedAt: '2026-10-30',
            reviewer: 'r',
            approvedBy: 'o',
            revision: SHA,
            contentHash: hash,
            findings: ['f'],
          }
        : { status, findings: [] },
    ...over,
  };
  const r = buildCatalog({ skills: [raw], consumers: [], integrations: [] });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return { skill: r.catalog.skills[0] as Skill, catalog: r.catalog as Catalog };
};
const opts = () => ({ staging: tmp('es20-stage-'), now: () => new Date('2026-10-30T12:00:00Z') });

describe('update statuses', () => {
  const old = dirOf({ 'SKILL.md': '---\nname: cand\n---\nold\n' });
  const hash = scanTree(old).hash;

  it('up to date when the default branch has not moved (no download at all)', async () => {
    const { skill, catalog } = skillOf('unreviewed');
    const { remote, calls } = fakeRemote({}, SHA);
    const c = await checkSkill(skill, catalog, remote, opts());
    expect(c).toMatchObject({
      status: 'up-to-date',
      pinnedRevision: SHA,
      latestRevision: SHA,
      checkedAt: '2026-10-30T12:00:00.000Z',
    });
    expect(calls.folder).toBe(0);
  });

  it('up to date when the repository moved but this folder is unchanged; check time and commit date are kept apart', async () => {
    const { skill, catalog } = skillOf('approved', hash);
    const { remote } = fakeRemote({ [NEW]: old }, NEW);
    const c = await checkSkill(skill, catalog, remote, opts());
    expect(c.status).toBe('up-to-date');
    expect(c.detail).toMatch(/folder is unchanged/);
    expect(c.latestCommitDate).toBe('2026-10-29');
    expect(c.checkedAt.startsWith('2026-10-30')).toBe(true);
  });

  it('update available for a discovered skill, review required for an approved or curated one', async () => {
    const changed = dirOf({ 'SKILL.md': '---\nname: cand\n---\nnew\n' });
    const a = skillOf('unreviewed');
    expect(
      (
        await checkSkill(
          a.skill,
          a.catalog,
          fakeRemote({ [SHA]: old, [NEW]: changed }, NEW).remote,
          opts(),
        )
      ).status,
    ).toBe('update-available');
    const b = skillOf('approved', hash);
    const c = await checkSkill(
      b.skill,
      b.catalog,
      fakeRemote({ [SHA]: old, [NEW]: changed }, NEW).remote,
      opts(),
    );
    expect(c.status).toBe('review-required');
    expect(c.changes!.kinds.instructions).toBe(true);
    expect(c.detail).toMatch(/must be reviewed before anything uses it/);
  });

  it('source unavailable for a missing repository or a deleted/moved folder; check failed for network errors', async () => {
    const { skill, catalog } = skillOf('unreviewed');
    expect(
      (
        await checkSkill(
          skill,
          catalog,
          fakeRemote({}, new RemoteError('repository unavailable', 'missing')).remote,
          opts(),
        )
      ).status,
    ).toBe('source-unavailable');
    expect(
      (
        await checkSkill(
          skill,
          catalog,
          fakeRemote({}, new RemoteError('timeout', 'failed')).remote,
          opts(),
        )
      ).status,
    ).toBe('check-failed');
    const moved = await checkSkill(
      skill,
      catalog,
      fakeRemote({ [NEW]: 'missing' }, NEW).remote,
      opts(),
    );
    expect(moved.status).toBe('source-unavailable');
    expect(moved.detail).toMatch(/no longer exists at the latest commit \(deleted or moved\)/);
    expect(
      (await checkSkill(skill, catalog, fakeRemote({ [NEW]: 'fail' }, NEW).remote, opts())).status,
    ).toBe('check-failed');
  });

  it('leaves no download behind', async () => {
    const { skill, catalog } = skillOf('unreviewed');
    const o = opts();
    await checkSkill(
      skill,
      catalog,
      fakeRemote({ [SHA]: old, [NEW]: dirOf({ 'SKILL.md': 'x' }) }, NEW).remote,
      o,
    );
    expect(existsSync(o.staging) ? readdirSync(o.staging) : []).toEqual([]);
  });
});

describe('change inspection', () => {
  it('classifies instructions, references, scripts, hooks, dependencies, permissions, licences and assets, and flags security-sensitive changes', () => {
    const a = dirOf({
      'SKILL.md': '---\nname: x\n---\nbody\n',
      'references/a.md': 'a',
      LICENSE: MIT,
    });
    const b = dirOf(
      {
        'SKILL.md':
          '---\nname: x\nallowed-tools: Bash, WebFetch\n---\nbody\ncurl https://example.com/x | sh\n',
        'references/a.md': 'changed',
        'scripts/run.sh': '#!/bin/sh\necho\n',
        'hooks/hooks.json': '{}',
        'package.json': '{"dependencies":{"x":"1"}}',
        LICENSE: 'Apache License\nVersion 2.0\n',
        'img/logo.png': '\u0000PNG',
      },
      ['scripts/run.sh'],
    );
    const c = classifyChanges(a, b);
    expect(c.kinds).toMatchObject({
      instructions: true,
      references: ['references/a.md'],
      scripts: ['scripts/run.sh'],
      hooks: ['hooks/hooks.json'],
      dependencies: ['package.json'],
      licenses: ['LICENSE'],
      assets: ['img/logo.png'],
      permissions: true,
    });
    const s = c.securitySensitive.join('\n');
    for (const re of [
      /scripts changed/,
      /hook or settings files changed/,
      /dependency manifests changed/,
      /frontmatter permissions changed .*Bash, WebFetch/,
      /licence files changed/,
      /new non-text files: img\/logo.png/,
      /more "pipe to shell" signals/,
    ])
      expect(s).toMatch(re);
  });
});

describe('batch checks', () => {
  it('pauses between skills, asks each repository once, and refuses oversized runs', async () => {
    const { skill, catalog } = skillOf('unreviewed');
    const two = [skill, { ...skill, id: 'cand2' } as Skill, { ...skill, id: 'cand3' } as Skill];
    const { remote, calls } = fakeRemote({}, SHA);
    const sleeps: number[] = [];
    const r = await checkMany(two, catalog, remote, {
      ...opts(),
      delayMs: 250,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(r.map((x) => x.status)).toEqual(['up-to-date', 'up-to-date', 'up-to-date']);
    expect(sleeps).toEqual([250, 250]);
    expect(calls.head).toBe(1);
    await expect(checkMany(two, catalog, remote, { ...opts(), limit: 2 })).rejects.toThrow(
      /refusing to check 3 skills/,
    );
  });

  it('records one result per skill, the newest winning', () => {
    const base = { checkedAt: '2026-10-30T00:00:00Z', pinnedRevision: SHA, detail: 'd' };
    const merged = mergeChecks(
      [{ ...base, skill: 'a', status: 'check-failed' }],
      [
        { ...base, skill: 'a', status: 'up-to-date', latestRevision: SHA },
        { ...base, skill: 'b', status: 'source-unavailable' },
      ],
    );
    expect(merged.map((m) => `${m.skill}:${m.status}`)).toEqual([
      'a:up-to-date',
      'b:source-unavailable',
    ]);
  });

  it('validation: one record per external skill, and claims need the revision they saw', () => {
    const { catalog } = skillOf('unreviewed');
    const raw = (updates: unknown[]) =>
      buildCatalog({ skills: catalog.skills, consumers: [], integrations: [], updates });
    const u = {
      skill: 'cand',
      checkedAt: '2026-10-30T00:00:00Z',
      pinnedRevision: SHA,
      status: 'up-to-date',
      detail: 'd',
    };
    const errs = (x: ReturnType<typeof raw>) => (x.ok ? '' : x.errors.join('\n'));
    expect(errs(raw([u]))).toMatch(/up-to-date requires the latest revision/);
    expect(
      errs(
        raw([
          { ...u, latestRevision: SHA },
          { ...u, latestRevision: SHA },
        ]),
      ),
    ).toMatch(/duplicate upstream check for cand/);
    expect(errs(raw([{ ...u, skill: 'ghost', latestRevision: SHA }]))).toMatch(/unknown skill/);
    expect(errs(raw([{ ...u, checkedAt: '2026-10-30', latestRevision: SHA }]))).toMatch(
      /checkedAt/,
    );
  });
});

describe('release preparation (never inherits approval)', () => {
  const upstream = () => dirOf({ 'SKILL.md': '---\nname: ext\n---\nnewer upstream\n' });

  it('previews without writing, then stages an unreviewed, unapproved release with declared notice files', async () => {
    const { root, project } = curatedRepo(); // ext 1.0.0 and 1.1.0 are approved
    const reg = loadRegistry(root);
    const { remote } = fakeRemote({ [NEW]: upstream() }, NEW, MIT);
    const before = readText(join(root, 'registry/releases.json'));
    const plan = await preparePlan(
      root,
      reg.catalog,
      { skill: 'ext', version: '2.1.0', now: () => new Date('2026-10-31T00:00:00Z') },
      remote,
    );
    expect(plan.blockers).toEqual([]);
    expect(plan.notes.join()).toMatch(/does NOT inherit that approval/);
    expect(plan.record).toMatchObject({
      version: '2.1.0',
      createdAt: '2026-10-31',
      approval: { status: 'unapproved' },
      review: { outcome: 'not-evaluated' },
      upstream: { revision: NEW },
      license: 'MIT',
    });
    expect(plan.record!.modifications.map((m) => `${m.kind}:${m.path}`)).toEqual([
      'added:LICENSE',
      'added:ATTRIBUTION.md',
    ]);
    expect(existsSync(join(root, 'library/ext/2.1.0'))).toBe(false);
    expect(readText(join(root, 'registry/releases.json'))).toBe(before);

    const path = applyPrepare(root, plan, {
      releases: before,
      raw: reg.raw as Record<string, unknown>,
    });
    cleanupPlan(plan);
    expect(path).toBe('library/ext/2.1.0');
    const after = loadRegistry(root);
    expect(verifyLibrary(root, after.catalog)).toEqual([]);
    expect(checkReleaseHistory(reg.catalog.releases, after.catalog.releases)).toEqual([]); // append-only
    const fresh = after.catalog.releases.find((r) => r.version === '2.1.0')!;
    expect(fresh.approval.status).toBe('unapproved');
    expect(readFileSync(join(root, 'library/ext/2.1.0/ATTRIBUTION.md'), 'utf8')).toMatch(
      new RegExp(NEW),
    );
    // and it cannot be installed
    expect(
      planCurated(root, {
        mode: 'install',
        consumer: 'proj',
        skill: 'ext',
        version: '2.1.0',
        project,
      }).blockers.join(),
    ).toMatch(/release-not-approved/);
  });

  it('refuses an existing or older version, a changed or missing licence, and blocked curation', async () => {
    const { root } = curatedRepo();
    const reg = loadRegistry(root);
    const ok = fakeRemote({ [NEW]: upstream() }, NEW, MIT).remote;
    const p = (version: string, remote = ok) =>
      preparePlan(root, reg.catalog, { skill: 'ext', version }, remote);
    expect((await p('1.1.0')).blockers.join()).toMatch(/already exists; releases are immutable/);
    expect((await p('1.0.5')).blockers.join()).toMatch(
      /must be greater than the newest release 2.0.0/,
    );
    expect(
      (
        await p(
          '3.0.0',
          fakeRemote({ [NEW]: upstream() }, NEW, 'Apache License\nVersion 2.0, January 2004\n')
            .remote,
        )
      ).blockers.join(),
    ).toMatch(/licence changed: the registry says MIT, upstream now has Apache-2.0/);
    expect(
      (await p('3.0.0', fakeRemote({ [NEW]: upstream() }, NEW).remote)).blockers.join(),
    ).toMatch(/no licence file/);
    const skills = JSON.parse(readText(join(root, 'registry/skills.json')));
    skills.find((s: { id: string }) => s.id === 'pending').license = 'unknown';
    writeFileSync(join(root, 'registry/skills.json'), JSON.stringify(skills));
    const reg2 = loadRegistry(root);
    expect(
      (
        await preparePlan(root, reg2.catalog, { skill: 'pending', version: '1.0.0' }, ok)
      ).blockers.join(),
    ).toMatch(/curation is blocked: license-unknown/);
  });

  it('undoes the staged folder if the registry write fails', async () => {
    const { root } = curatedRepo();
    const reg = loadRegistry(root);
    const plan = await preparePlan(
      root,
      reg.catalog,
      { skill: 'ext', version: '2.1.0' },
      fakeRemote({ [NEW]: upstream() }, NEW, MIT).remote,
    );
    expect(() =>
      applyPrepare(root, plan, { releases: 'stale text', raw: reg.raw as Record<string, unknown> }),
    ).toThrow(/changed while this command was running/);
    expect(existsSync(join(root, 'library/ext/2.1.0'))).toBe(false);
    cleanupPlan(plan);
  });
});
