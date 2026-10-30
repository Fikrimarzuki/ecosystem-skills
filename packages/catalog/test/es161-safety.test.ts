import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cpSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, type Skill } from '../src/index.ts';
import { findConsumer, loadRegistry } from '../src/consumers.ts';
import { fetchSkill, installBlocker, installSkill, type Fetch } from '../src/install.ts';
import { applySync, planSync, verifyConsumer } from '../src/sync.ts';
import { scanTree } from '../src/tree.ts';
import { makeRepo, SHA, tmp, write } from './fixtures.ts';

/* ES16.1: a discovered candidate must never become executable merely because it is in the registry. */
const HASH = `sha256-${'b'.repeat(64)}`;
const UP = 'https://github.com/org/repo';
const candidate = (
  over: Record<string, unknown> = {},
  discovery: Record<string, unknown> = {},
) => ({
  id: 'cand',
  name: 'Cand',
  description: 'd',
  category: 'general',
  origin: 'external',
  source: { type: 'external', upstream: { url: UP }, path: 'skills/cand', revision: SHA },
  author: 'Org',
  license: 'MIT',
  review: { status: 'unreviewed', findings: [] },
  discovery: {
    discoveredAt: '2026-10-30',
    outcome: 'register-for-review',
    source: 'org-repo',
    contentHash: HASH,
    audit: 'scan',
    ...discovery,
  },
  ...over,
});
const sourceFor = (ids: string[], decision = 'register-for-review') => ({
  id: 'org-repo',
  name: 'Org repo',
  batch: 'discovered',
  kind: 'skill-collection',
  resolution: 'verified',
  decision,
  upstream: { url: UP },
  revision: SHA,
  skills: ids,
  summary: 's',
  discoveredAt: '2026-10-30',
});
const reg = (skills: unknown[], over: Record<string, unknown> = {}) => ({
  skills,
  consumers: [],
  integrations: [],
  sources: [
    sourceFor(
      skills.map((s) => (s as { id: string }).id),
      'register-with-warnings',
    ),
  ],
  ...over,
});
const errors = (raw: unknown) => {
  const r = buildCatalog(raw);
  return r.ok ? [] : r.errors.join('\n');
};
const approved = (extra: Record<string, unknown> = {}) => ({
  status: 'approved',
  reviewedAt: '2026-10-31',
  reviewer: 'r',
  approvedBy: 'owner',
  revision: SHA,
  contentHash: HASH,
  findings: ['read the folder'],
  ...extra,
});
const warn = { outcome: 'register-with-warnings', warnings: ['runs a script'] };

describe('approval gates (registry validation)', () => {
  it('a plain discovered candidate is valid and stays unreviewed', () => {
    expect(errors(reg([candidate()]))).toEqual([]);
  });

  it('cannot be approved while discovery lists approval blockers', () => {
    const c = candidate(
      { review: approved() },
      { ...warn, approvalBlockers: ['licence unknown'], warnings: ['licence unknown'] },
    );
    expect(errors(reg([c]))).toMatch(/1 approval blocker\(s\); resolve them/);
  });

  it('cannot be approved with warnings and no review findings; findings satisfy the gate', () => {
    const bare = candidate({ review: approved({ findings: [] }) }, warn);
    expect(errors(reg([bare]))).toMatch(/approved without review findings/);
    expect(errors(reg([candidate({ review: approved() }, warn)]))).toEqual([]);
  });

  it('a review of the pinned revision must hash to what discovery hashed', () => {
    const c = candidate({ review: approved({ contentHash: `sha256-${'c'.repeat(64)}` }) });
    expect(errors(reg([c]))).toMatch(/review contentHash differs from the discovery contentHash/);
  });

  it('a repository-root skill cannot be approved, but can stay a candidate or be reviewed', () => {
    const root = (review: unknown) =>
      candidate({
        review,
        source: { type: 'external', upstream: { url: UP }, path: '.', revision: SHA },
      });
    expect(errors(reg([root(approved())]))).toMatch(/repository-root skill .* cannot be approved/);
    expect(errors(reg([root({ status: 'unreviewed', findings: [] })]))).toEqual([]);
    expect(errors(reg([root(approved({ status: 'reviewed', approvedBy: undefined }))]))).toEqual(
      [],
    );
  });

  it('outcome and warnings must agree, and blockers must also be shown as warnings', () => {
    expect(errors(reg([candidate({}, { warnings: ['x'] })]))).toMatch(
      /register-for-review cannot carry warnings/,
    );
    expect(
      errors(reg([candidate({}, { ...warn, warnings: ['x'], approvalBlockers: ['y'] })])),
    ).toEqual([]); // a blocker with a different text is still allowed: the warning list is non-empty
    expect(
      errors(reg([candidate({}, { outcome: 'register-for-review', approvalBlockers: ['y'] })])),
    ).toMatch(/approval blockers must also be visible as warnings/);
  });

  it('a consumer cannot be assigned a candidate (or any unapproved external skill) at all', () => {
    const consumer = {
      id: 'proj',
      name: 'P',
      kind: 'project',
      agents: ['claude-code'],
      assignments: [{ skill: 'cand', agents: ['claude-code'] }],
    };
    expect(errors(reg([candidate()], { consumers: [consumer] }))).toMatch(
      /assigns external skill "cand" whose review status is "unreviewed"/,
    );
  });

  it('rejects malformed records: missing source, unlisted skill, duplicate ids, bad paths', () => {
    expect(errors(reg([candidate({}, { source: 'nope' })]))).toMatch(/unknown source "nope"/);
    expect(errors({ ...reg([candidate()]), sources: [sourceFor([])] })).toMatch(
      /does not list this skill|requires at least one registered skill|cannot list/,
    );
    expect(errors(reg([candidate(), candidate()]))).toMatch(/duplicate skills id: cand/);
    for (const path of ['', './x', 'a/./b', '../x', '/abs', 'a\\b', 'a//b', 'C:/x']) {
      const c = candidate({
        source: { type: 'external', upstream: { url: UP }, path, revision: SHA },
      });
      expect(errors(reg([c])), `path ${JSON.stringify(path)}`).toMatch(/path/);
    }
    expect(
      errors(
        reg([
          candidate({
            source: { type: 'external', upstream: { url: UP }, path: 'skills/x', revision: 'main' },
          }),
        ]),
      ),
    ).toMatch(/full 40-character/);
  });
});

describe('installBlocker (pure) and installSkill (no trace on refusal)', () => {
  const skillOf = (over: Record<string, unknown>, discovery?: Record<string, unknown>) => {
    const r = buildCatalog(reg([candidate(over, discovery)]));
    if (!r.ok) throw new Error(r.errors.join('\n'));
    return r.catalog.skills[0] as Skill;
  };
  const noFetch: Fetch = async () => {
    throw new Error('network must not be touched');
  };
  const listing = (p: string) =>
    existsSync(p) ? readdirSync(p, { recursive: true }).map(String).sort() : [];

  it('explains why each kind of record cannot be installed', () => {
    expect(installBlocker(skillOf({}))).toMatch(/not approved \(review status: unreviewed\)/);
    expect(installBlocker(skillOf({ review: approved() }))).toBeUndefined();
    const rootSkill = skillOf({
      review: {
        status: 'reviewed',
        reviewedAt: '2026-10-31',
        reviewer: 'r',
        revision: SHA,
        contentHash: HASH,
        findings: [],
      },
      source: { type: 'external', upstream: { url: UP }, path: '.', revision: SHA },
    });
    // approval is the gate; simulate a record that bypassed validation
    const forced = { ...rootSkill, review: { ...rootSkill.review, status: 'approved' as const } };
    expect(installBlocker(forced as Skill)).toMatch(/repository root.*subset install/);
    const blocked = {
      ...skillOf({ review: approved() }, warn),
      discovery: { ...skillOf({}, warn).discovery!, approvalBlockers: ['licence unknown'] },
    };
    expect(installBlocker(blocked as Skill)).toMatch(
      /unresolved approval blockers: licence unknown/,
    );
    expect(
      installBlocker({
        ...skillOf({}),
        review: { ...skillOf({}).review, status: 'approved' as const },
      } as Skill),
    ).toMatch(/does not cover the pinned revision/);
  });

  it('refuses unapproved, root-level and blocked skills before any network or filesystem access', async () => {
    const root = tmp('es-norepo-');
    const before = listing(root);
    const rootSkill = {
      ...skillOf({}),
      source: { type: 'external' as const, upstream: { url: UP }, path: '.', revision: SHA },
      review: {
        status: 'approved' as const,
        reviewedAt: 'x',
        reviewer: 'r',
        approvedBy: 'o',
        revision: SHA,
        contentHash: HASH,
        findings: [],
      },
    } as Skill;
    for (const [s, re] of [
      [skillOf({}), /not approved/],
      [rootSkill, /repository root/],
    ] as const)
      await expect(installSkill(root, s, noFetch)).rejects.toThrow(re);
    expect(listing(root)).toEqual(before);
    expect(existsSync(join(root, 'external'))).toBe(false);
  });

  it('fetchSkill (used by review and install) also refuses ".", before creating any directory', async () => {
    const stage = join(tmp('es-stage-'), 'staging');
    const s = { type: 'external' as const, upstream: { url: UP }, path: '.', revision: SHA };
    await expect(fetchSkill(s, stage, noFetch)).rejects.toThrow(/repository root.*--dir/);
    expect(existsSync(stage)).toBe(false);
  });
});

describe('defence in depth: sync and verify never activate an unapproved skill', () => {
  it('blocks a hand-injected assignment to a reviewed-but-unapproved skill even with a stale local copy', () => {
    const { root, project } = makeRepo();
    // stale local metadata: a copy of the unapproved skill sits in external/skills and is even listed in installed.json
    write(join(root, 'external/skills/pending/SKILL.md'), '---\nname: pending\n---\nstale\n');
    const lock = JSON.parse(readFileSync(join(root, 'external/installed.json'), 'utf8'));
    lock.pending = {
      revision: SHA,
      contentHash: scanTree(join(root, 'external/skills/pending')).hash,
      installedAt: 'x',
    };
    writeFileSync(join(root, 'external/installed.json'), JSON.stringify(lock));
    const registry = loadRegistry(root);
    const consumer = {
      ...findConsumer(registry, 'proj'),
      assignments: [
        {
          skill: 'pending',
          agents: ['claude-code' as const],
          install: 'symlink' as const,
          verification: { status: 'unverified' as const },
        },
      ],
    };
    const plan = planSync(root, registry.catalog, consumer, project);
    expect(plan.blockers.length).toBeGreaterThan(0);
    expect(plan.blockers.map((b) => b.detail).join(' ')).toMatch(
      /only approved external skills can be assigned/,
    );
    const before = readdirSync(project, { recursive: true }).map(String).sort();
    try {
      applySync(plan);
    } catch {
      /* a refused sync is the expected outcome */
    }
    expect(readdirSync(project, { recursive: true }).map(String).sort()).toEqual(before);
    const checks = verifyConsumer(root, registry.catalog, consumer, project);
    expect(
      checks.some((c) => c.level === 'error' && /only approved external skills/.test(c.message)),
    ).toBe(true);
  });

  it('a registry with a missing source reference refuses to load, so no command can proceed', () => {
    const { root } = makeRepo();
    const skills = JSON.parse(readFileSync(join(root, 'registry/skills.json'), 'utf8'));
    skills.push(candidate({}, { source: 'ghost' }));
    writeFileSync(join(root, 'registry/skills.json'), JSON.stringify(skills));
    expect(() => loadRegistry(root)).toThrow(/unknown source "ghost"/);
  });
});

describe('cli: refusals are early, explicit and leave the checkout untouched', () => {
  const pkg = resolve(__dirname, '..');
  const TSX = join(pkg, 'node_modules/tsx/dist/cli.mjs');
  function cliRepo(skills: unknown[]) {
    const r = makeRepo();
    cpSync(join(pkg, 'src'), join(r.root, 'packages/catalog/src'), { recursive: true });
    cpSync(join(pkg, 'package.json'), join(r.root, 'packages/catalog/package.json'));
    symlinkSync(join(pkg, 'node_modules'), join(r.root, 'packages/catalog/node_modules'));
    const existing = JSON.parse(readFileSync(join(r.root, 'registry/skills.json'), 'utf8'));
    write(join(r.root, 'registry/skills.json'), JSON.stringify([...existing, ...skills]));
    write(
      join(r.root, 'registry/sources.json'),
      JSON.stringify([
        sourceFor(
          skills.map((s) => (s as { id: string }).id),
          'register-with-warnings',
        ),
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
  const snapshot = (root: string) =>
    readdirSync(join(root, 'external'), { recursive: true }).map(String).sort();

  it('install of a discovered candidate (root-level or not) exits non-zero and changes nothing', () => {
    const rootLevel = candidate(
      {
        id: 'rootcand',
        source: { type: 'external', upstream: { url: UP }, path: '.', revision: SHA },
      },
      warn,
    );
    const { root } = cliRepo([candidate({}, warn), rootLevel]);
    const before = snapshot(root);
    for (const id of ['cand', 'rootcand']) {
      const r = run(root, 'install', id);
      expect(r.status, r.stderr).not.toBe(0);
      expect(r.stderr).toMatch(/not approved/);
    }
    expect(snapshot(root)).toEqual(before);
  }, 60_000);

  it('a root-level skill that someone marks approved makes the whole registry invalid', () => {
    const forged = candidate(
      {
        review: approved(),
        id: 'forged',
        source: { type: 'external', upstream: { url: UP }, path: '.', revision: SHA },
      },
      warn,
    );
    const { root } = cliRepo([forged]);
    const before = snapshot(root);
    const r = run(root, 'install', 'forged');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Registry invalid[\s\S]*repository-root skill/);
    expect(snapshot(root)).toEqual(before);
  }, 60_000);
});
