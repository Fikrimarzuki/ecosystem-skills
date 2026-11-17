import {
  existsSync,
  lstatSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyCurated,
  consumerInventory,
  formatPlan,
  planCurated,
  type Mode,
} from '../src/curated.ts';
import { assignSkill, findConsumer, loadRegistry } from '../src/consumers.ts';
import { readCuratedLock } from '../src/store.ts';
import { applySync, planSync, verifyConsumer } from '../src/sync.ts';
import { curatedRepo, readText, setRelease } from './curatedfix.ts';

/* ES21: version management, upgrade, rollback and legacy migration. Disposable fixtures only. */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, pre: string) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      const st = lstatSync(p);
      out.push(pre + n + (st.isSymbolicLink() ? ` -> ${readlinkSync(p)}` : ''));
      if (st.isDirectory()) walk(p, `${pre}${n}/`);
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out;
}
const state = (root: string, project: string) => ({
  project: snapshot(project),
  store: snapshot(join(root, 'external')),
  consumers: readText(join(root, 'registry/consumers.json')),
});
const plan = (root: string, project: string, mode: Mode, version: string, extra = {}) =>
  planCurated(root, { mode, consumer: 'proj', skill: 'ext', version, project, ...extra });
const linksTo = (root: string, project: string) =>
  ['.claude/skills/ext', '.agents/skills/ext'].map((r) =>
    realpathSync(join(project, r)).slice(realpathSync(root).length + 1),
  );
let clock = 0;
const now = () => new Date(Date.UTC(2026, 9, 31, 10, clock++));

function installed(versions?: Parameters<typeof curatedRepo>[0]) {
  const r = curatedRepo(versions);
  applyCurated(plan(r.root, r.project, 'install', '1.0.0'), { now });
  return r;
}

describe('upgrade', () => {
  it('previews the change, then re-points every link atomically, keeping the old version for rollback', () => {
    const { root, project, releases } = installed();
    // an unrelated entry in the agent directory must survive untouched
    mkdirSync(join(project, '.claude/skills/mine'), { recursive: true });
    writeFileSync(join(project, '.claude/skills/mine/SKILL.md'), 'mine');
    const before = state(root, project);
    const p = plan(root, project, 'upgrade', '1.1.0');
    expect(p.blockers).toEqual([]);
    expect(p.current).toBe('1.0.0');
    expect(p.diff).toMatchObject({ changed: ['SKILL.md'], added: [], removed: [] });
    expect(p.links.map((l) => `${l.rel}:${l.action}:${l.current}`)).toEqual([
      '.claude/skills/ext:repoint:1.0.0',
      '.agents/skills/ext:repoint:1.0.0',
    ]);
    expect(p.rollbackTo).toMatchObject({ version: '1.0.0', available: true });
    expect(formatPlan(p)).toMatch(
      /UPGRADE PREVIEW: ext 1.0.0 → 1.1.0[\s\S]*changes vs current: \+0 added, 1 changed[\s\S]*rollback afterwards: rollback to 1.0.0 stays possible/,
    );
    expect(state(root, project)).toEqual(before); // preview is read-only

    applyCurated(p, { now });
    expect(linksTo(root, project)).toEqual([
      'external/releases/ext/1.1.0',
      'external/releases/ext/1.1.0',
    ]);
    expect(existsSync(join(root, 'external/releases/ext/1.0.0'))).toBe(true);
    expect(readText(join(project, '.claude/skills/mine/SKILL.md'))).toBe('mine');
    const reg = loadRegistry(root);
    expect(findConsumer(reg, 'proj').assignments.find((a) => a.skill === 'ext')).toMatchObject({
      release: '1.1.0',
      verification: { status: 'unverified' },
    });
    const t = readCuratedLock(root).lock.consumers.proj!.ext!;
    expect(t.history.map((h) => `${h.action}:${h.version}`)).toEqual([
      'install:1.0.0',
      'upgrade:1.1.0',
    ]);
    expect(t.current.contentHash).toBe(releases[1]!.curatedHash);
    expect(
      verifyConsumer(root, reg.catalog, findConsumer(reg, 'proj'), project)
        .filter((c) => c.subject.includes('ext'))
        .every((c) => c.level !== 'error'),
    ).toBe(true);
  });

  it('refuses unapproved targets, the current version, and unknown versions, changing nothing', () => {
    const { root, project } = installed();
    const before = state(root, project);
    expect(plan(root, project, 'upgrade', '2.0.0').blockers.join()).toMatch(/release-not-approved/);
    expect(plan(root, project, 'upgrade', '1.0.0').blockers.join()).toMatch(
      /already uses ext 1.0.0/,
    );
    expect(plan(root, project, 'upgrade', '5.0.0').blockers.join()).toMatch(
      /no curated release 5.0.0/,
    );
    expect(() => applyCurated(plan(root, project, 'upgrade', '2.0.0'))).toThrow(/refused/);
    expect(state(root, project)).toEqual(before);
  });

  it('notes compatibility concerns recorded on the target release', () => {
    const { root, project } = installed();
    setRelease(root, '1.1.0', {
      supportedAgents: ['claude-code'],
      restrictions: ['needs Node 20'],
    });
    const notes = plan(root, project, 'upgrade', '1.1.0').notes.join('\n');
    expect(notes).toMatch(/does not list codex as a supported agent/);
    expect(notes).toMatch(/restriction: needs Node 20/);
  });

  it('an interrupted upgrade leaves the consumer exactly as it was', () => {
    for (let failAfter = 0; failAfter <= 5; failAfter++) {
      const { root, project } = installed();
      const before = state(root, project);
      const lockBefore = readText(join(root, 'external/releases.lock.json'));
      expect(
        () => applyCurated(plan(root, project, 'upgrade', '1.1.0'), { failAfter, now }),
        `failAfter ${failAfter}`,
      ).toThrow(/upgrade failed: simulated failure/);
      expect(state(root, project), `failAfter ${failAfter}`).toEqual(before);
      expect(readText(join(root, 'external/releases.lock.json'))).toBe(lockBefore);
      expect(linksTo(root, project)).toEqual([
        'external/releases/ext/1.0.0',
        'external/releases/ext/1.0.0',
      ]);
    }
  });

  it('refuses when a consumer link was replaced by something it does not own', () => {
    const { root, project } = installed();
    unlinkSync(join(project, '.claude/skills/ext'));
    symlinkSync('/tmp', join(project, '.claude/skills/ext'));
    expect(plan(root, project, 'upgrade', '1.1.0').blockers.join()).toMatch(
      /\.claude\/skills\/ext: symlink not owned/,
    );
  });
});

describe('rollback', () => {
  it('restores a previously installed, verified version only after an explicit apply', () => {
    const { root, project } = installed();
    applyCurated(plan(root, project, 'upgrade', '1.1.0'), { now });
    const p = plan(root, project, 'rollback', '1.0.0');
    expect(p.blockers).toEqual([]);
    expect(p.store).toBe('verified');
    expect(linksTo(root, project)).toEqual([
      'external/releases/ext/1.1.0',
      'external/releases/ext/1.1.0',
    ]); // preview changed nothing
    applyCurated(p, { now });
    expect(linksTo(root, project)).toEqual([
      'external/releases/ext/1.0.0',
      'external/releases/ext/1.0.0',
    ]);
    expect(readCuratedLock(root).lock.consumers.proj!.ext!.history.map((h) => h.action)).toEqual([
      'install',
      'upgrade',
      'rollback',
    ]);
  });

  it('never restores a version that was not installed here, tampered content, or a withdrawn release', () => {
    const { root, project } = installed();
    expect(plan(root, project, 'rollback', '1.1.0').blockers.join()).toMatch(
      /was never installed for proj here/,
    );
    applyCurated(plan(root, project, 'upgrade', '1.1.0'), { now });
    writeFileSync(join(root, 'external/releases/ext/1.0.0/SKILL.md'), 'tampered');
    expect(plan(root, project, 'rollback', '1.0.0').blockers.join()).toMatch(
      /store copy external\/releases\/ext\/1.0.0 does not match the release/,
    );
    const r2 = installed();
    applyCurated(plan(r2.root, r2.project, 'upgrade', '1.1.0'), { now });
    setRelease(r2.root, '1.0.0', {
      approval: { status: 'withdrawn', approvedBy: 'Owner', approvedAt: '2026-10-31' },
    });
    expect(plan(r2.root, r2.project, 'rollback', '1.0.0').blockers.join()).toMatch(
      /release-not-approved \(withdrawn\)/,
    );
  });
});

describe('legacy migration (explicit and reversible)', () => {
  function legacyRepo() {
    const r = curatedRepo();
    assignSkill(r.root, 'proj', 'ext');
    const reg = loadRegistry(r.root);
    applySync(planSync(r.root, reg.catalog, findConsumer(reg, 'proj'), r.project));
    return r;
  }

  it('a legacy install is never converted silently: upgrade needs --migrate', () => {
    const { root, project } = legacyRepo();
    expect(plan(root, project, 'upgrade', '1.0.0').blockers.join()).toMatch(
      /legacy upstream install of ext.*pass --migrate/,
    );
    expect(linksTo(root, project)).toEqual(['external/skills/ext', 'external/skills/ext']);
  });

  it('migrates with --migrate, records the legacy baseline, and rolls back to legacy', () => {
    const { root, project } = legacyRepo();
    const p = plan(root, project, 'upgrade', '1.0.0', { migrate: true });
    expect(p.blockers).toEqual([]);
    expect(p.links.map((l) => l.current)).toEqual(['legacy', 'legacy']);
    applyCurated(p, { now });
    expect(linksTo(root, project)).toEqual([
      'external/releases/ext/1.0.0',
      'external/releases/ext/1.0.0',
    ]);
    expect(
      readCuratedLock(root).lock.consumers.proj!.ext!.history.map(
        (h) => `${h.action}:${h.version}`,
      ),
    ).toEqual(['baseline:legacy', 'migrate:1.0.0']);
    const back = plan(root, project, 'rollback', 'legacy');
    expect(back.blockers).toEqual([]);
    applyCurated(back, { now });
    expect(linksTo(root, project)).toEqual(['external/skills/ext', 'external/skills/ext']);
    const reg = loadRegistry(root);
    expect(
      findConsumer(reg, 'proj').assignments.find((a) => a.skill === 'ext')!.release,
    ).toBeUndefined();
    const v = verifyConsumer(root, reg.catalog, findConsumer(reg, 'proj'), project).filter((c) =>
      c.subject.includes('ext'),
    );
    expect(v.every((c) => c.level !== 'error')).toBe(true);
  });
});

describe('inventory', () => {
  it('distinguishes legacy from curated, desired from installed, and reports drift, upgrades and rollback', () => {
    const { root, project } = installed();
    let [row] = consumerInventory(root, 'proj', project);
    expect(row).toMatchObject({
      skill: 'ext',
      kind: 'curated',
      desired: '1.0.0',
      installed: '1.0.0',
      store: 'verified',
      available: '1.1.0',
      drift: [],
      upgrade: { eligible: true, to: '1.1.0' },
      rollback: { available: false },
    });
    applyCurated(plan(root, project, 'upgrade', '1.1.0'), { now });
    // someone points one link back by hand: drift
    unlinkSync(join(project, '.agents/skills/ext'));
    symlinkSync(
      '../../../' + join(root.split('/').slice(-1)[0]!, 'external/releases/ext/1.0.0'),
      join(project, '.agents/skills/ext'),
    );
    [row] = consumerInventory(root, 'proj', project);
    expect(row!.installed).toBe('mixed');
    expect(row!.drift.join()).toMatch(/links point to mixed, the registry wants 1.1.0/);
    expect(row!.rollback).toMatchObject({ to: '1.0.0', available: true });
    expect(row!.available).toBeUndefined(); // 2.0.0 is not approved
  });

  it('does not infer a curated install from a legacy one', () => {
    const r = curatedRepo();
    assignSkill(r.root, 'proj', 'ext');
    const [row] = consumerInventory(r.root, 'proj');
    expect(row).toMatchObject({
      kind: 'legacy',
      desired: 'legacy',
      installedHash: undefined,
      store: undefined,
    });
    expect(row!.upgrade.why).toMatch(/migration to 1.1.0 is possible/);
  });
});
