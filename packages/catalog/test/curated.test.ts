import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyCurated, formatPlan, planCurated } from '../src/curated.ts';
import { findConsumer, loadRegistry, assignSkill } from '../src/consumers.ts';
import { readCuratedLock } from '../src/store.ts';
import { planSync, verifyConsumer } from '../src/sync.ts';
import { scanTree } from '../src/tree.ts';
import { tmp } from './fixtures.ts';
import { curatedRepo, readText, setRelease } from './curatedfix.ts';

/* ES18: curated installation from the library. Disposable fixtures only. */
/** Every path under dir, without following symlinks (a link is listed, never entered). */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, pre: string) => {
    for (const n of readdirSync(d).sort()) {
      out.push(pre + n);
      if (lstatSync(join(d, n)).isDirectory()) walk(join(d, n), `${pre}${n}/`);
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out;
}
const state = (root: string, project: string) => ({
  project: snapshot(project),
  external: snapshot(join(root, 'external')),
  consumers: readText(join(root, 'registry/consumers.json')),
});
const install = (root: string, project: string, version = '1.0.0', extra = {}) =>
  planCurated(root, {
    mode: 'install',
    consumer: 'proj',
    skill: 'ext',
    version,
    project,
    ...extra,
  });

describe('preview (read-only)', () => {
  it('shows release, destination, files, review, approval and links, and changes nothing', () => {
    const { root, project } = curatedRepo();
    const before = state(root, project);
    const p = install(root, project);
    expect(p.blockers).toEqual([]);
    expect(p.release!.version).toBe('1.0.0');
    expect(p.store).toBe('absent');
    expect(p.files.sort()).toEqual(['ATTRIBUTION.md', 'LICENSE', 'SKILL.md']);
    expect(p.links.map((l) => `${l.rel}:${l.action}`)).toEqual([
      '.claude/skills/ext:create',
      '.agents/skills/ext:create',
    ]);
    expect(p.approval).toBe('approved');
    expect(p.review!.outcome).toBe('no-blocking-issues');
    const text = formatPlan(p);
    expect(text).toMatch(/INSTALL PREVIEW: ext 1.0.0 for proj/);
    expect(text).toMatch(/Nothing was changed; re-run with --apply/);
    expect(state(root, project)).toEqual(before);
  });
});

describe('install', () => {
  it('copies the verified release into the store, records the version, links the consumer and tracks it', () => {
    const { root, project, releases } = curatedRepo();
    const r = applyCurated(install(root, project), { now: () => new Date('2026-10-31T10:00:00Z') });
    expect(r.applied.join('\n')).toMatch(/stored external\/releases\/ext\/1.0.0/);
    const store = join(root, 'external/releases/ext/1.0.0');
    expect(scanTree(store).hash).toBe(releases[0]!.curatedHash);
    for (const rel of ['.claude/skills/ext', '.agents/skills/ext']) {
      expect(readlinkSync(join(project, rel))).not.toMatch(/^\//); // relative link
      expect(realpathSync(join(project, rel))).toBe(realpathSync(store));
    }
    const reg = loadRegistry(root);
    expect(findConsumer(reg, 'proj').assignments.find((a) => a.skill === 'ext')).toMatchObject({
      release: '1.0.0',
      install: 'symlink',
      verification: { status: 'unverified' },
    });
    const { lock } = readCuratedLock(root);
    expect(lock.store['ext@1.0.0']).toMatchObject({
      contentHash: releases[0]!.curatedHash,
      release: { skill: 'ext', version: '1.0.0', upstreamRevision: 'a'.repeat(40) },
    });
    expect(lock.consumers.proj!.ext!.current).toMatchObject({
      version: '1.0.0',
      contentHash: releases[0]!.curatedHash,
      at: '2026-10-31T10:00:00.000Z',
      action: 'install',
    });
    // nothing tracked inside the consumer repository
    expect(snapshot(project).filter((f) => !f.startsWith('.git'))).toEqual([
      '.agents',
      '.agents/skills',
      '.agents/skills/ext',
      '.claude',
      '.claude/skills',
      '.claude/skills/ext',
    ]);
    // sync and verify agree that the curated activation is correct
    const plan = planSync(root, reg.catalog, findConsumer(reg, 'proj'), project);
    expect(plan.items.filter((i) => i.name === 'ext').map((i) => i.state)).toEqual(['ok', 'ok']);
    const checks = verifyConsumer(root, reg.catalog, findConsumer(reg, 'proj'), project);
    expect(checks.filter((c) => c.subject.includes('ext')).every((c) => c.level !== 'error')).toBe(
      true,
    );
    expect(checks.find((c) => c.subject === 'ext' && c.level === 'ok')!.message).toMatch(
      /curated release 1.0.0/,
    );
  });

  it('never runs bundled scripts (a script that would leave a marker is only copied)', () => {
    const { root, project } = curatedRepo([{ version: '1.0.0', body: 'x', script: true }]);
    applyCurated(install(root, project));
    expect(existsSync(join(root, 'EXECUTED'))).toBe(false);
    expect(existsSync(join(root, 'external/releases/ext/1.0.0/scripts/run.sh'))).toBe(true);
  });

  it('refuses unapproved releases, incomplete reviews and unknown versions, changing nothing', () => {
    const { root, project } = curatedRepo();
    const before = state(root, project);
    expect(install(root, project, '2.0.0').blockers.join()).toMatch(
      /release-not-approved.*review-incomplete|review-incomplete.*release-not-approved/,
    );
    expect(() => applyCurated(install(root, project, '2.0.0'))).toThrow(/refused: 2 blocker/);
    expect(install(root, project, '9.9.9').blockers.join()).toMatch(/no curated release 9.9.9/);
    expect(state(root, project)).toEqual(before);
  });

  it('cannot use a release whose security evidence is missing: the registry itself refuses the record', () => {
    const { root, project } = curatedRepo();
    setRelease(root, '1.0.0', {
      review: {
        outcome: 'no-blocking-issues',
        reviewer: 'r',
        reviewedAt: '2026-10-31',
        scope: 's',
        contentHash: 'sha256-' + '0'.repeat(64),
        checks: [],
        evidence: [],
      },
    });
    expect(() => install(root, project)).toThrow(/registry is invalid[\s\S]*requires evidence/);
  });

  it('refuses modified library content and never falls back to a download', () => {
    const { root, project } = curatedRepo();
    writeFileSync(join(root, 'library/ext/1.0.0/SKILL.md'), 'tampered');
    expect(install(root, project).blockers.join()).toMatch(/library: ext@1.0.0: content hash/);
    const r2 = curatedRepo();
    rmSync(join(r2.root, 'library/ext/1.0.0'), { recursive: true });
    expect(install(r2.root, r2.project).blockers.join()).toMatch(
      /library: ext@1.0.0: library\/ext\/1.0.0 is missing/,
    );
  });

  it('refuses a tampered or untracked store folder instead of using or replacing it', () => {
    const { root, project } = curatedRepo();
    mkdirSync(join(root, 'external/releases/ext/1.0.0'), { recursive: true });
    writeFileSync(join(root, 'external/releases/ext/1.0.0/SKILL.md'), 'planted');
    expect(install(root, project).blockers.join()).toMatch(
      /exists but was not installed by this tool/,
    );
    const r2 = curatedRepo();
    applyCurated(install(r2.root, r2.project));
    writeFileSync(join(r2.root, 'external/releases/ext/1.0.0/SKILL.md'), 'tampered');
    const reg = loadRegistry(r2.root);
    const checks = verifyConsumer(r2.root, reg.catalog, findConsumer(reg, 'proj'), r2.project);
    expect(
      checks.some(
        (c) => c.level === 'error' && /store copy of ext@1.0.0 is tampered/.test(c.message),
      ),
    ).toBe(true);
  });

  it('rejects symlink attacks: symlinked store, symlinked agent dir, foreign link in the way', () => {
    const outside = tmp('es-outside-');
    const a = curatedRepo();
    symlinkSync(outside, join(a.root, 'external/releases'));
    expect(install(a.root, a.project).blockers.join()).toMatch(/not a plain directory tree/);
    expect(snapshot(outside)).toEqual([]);

    const b = curatedRepo();
    symlinkSync(outside, join(b.project, '.claude'));
    expect(() => install(b.root, b.project)).toThrow(/is a symlink; refusing to write through it/);

    const c = curatedRepo();
    mkdirSync(join(c.project, '.claude/skills'), { recursive: true });
    symlinkSync(outside, join(c.project, '.claude/skills/ext'));
    expect(install(c.root, c.project).blockers.join()).toMatch(
      /symlink not owned by Ecosystem Skills/,
    );
  });

  it('treats an existing file or directory in the way as a conflict, never overwriting it', () => {
    const { root, project } = curatedRepo();
    mkdirSync(join(project, '.claude/skills/ext'), { recursive: true });
    writeFileSync(join(project, '.claude/skills/ext/SKILL.md'), 'mine');
    const p = install(root, project);
    expect(p.blockers.join()).toMatch(/an unmanaged dir is in the way/);
    expect(() => applyCurated(p)).toThrow(/refused/);
    expect(readText(join(project, '.claude/skills/ext/SKILL.md'))).toBe('mine');
  });

  it('rolls back every completed step when any step fails (store, registry, links, tracking)', () => {
    for (let failAfter = 0; failAfter <= 6; failAfter++) {
      const { root, project } = curatedRepo();
      const before = state(root, project);
      expect(
        () => applyCurated(install(root, project), { failAfter }),
        `failAfter ${failAfter}`,
      ).toThrow(
        /install failed: simulated failure; (nothing had been changed|all \d+ completed step\(s\) were rolled back)/,
      );
      expect(state(root, project), `failAfter ${failAfter}`).toEqual(before);
      expect(existsSync(join(root, 'external/releases.lock.json'))).toBe(false);
    }
  });

  it('refuses when the registry changed between preview and apply', () => {
    const { root, project } = curatedRepo();
    const p = install(root, project);
    writeFileSync(
      join(root, 'registry/consumers.json'),
      readText(join(root, 'registry/consumers.json')) + '\n',
    );
    expect(() => applyCurated(p)).toThrow(/changed since the preview/);
    expect(existsSync(join(root, 'external/releases/ext/1.0.0'))).toBe(false);
  });

  it('keeps the legacy path: a legacy assignment is not silently converted, and legacy sync still works', () => {
    const { root, project } = curatedRepo();
    assignSkill(root, 'proj', 'ext'); // legacy: external/skills/ext installed by the fixture
    expect(install(root, project).blockers.join()).toMatch(
      /already assigned to proj \(legacy upstream install\); use upgrade or rollback/,
    );
    const reg = loadRegistry(root);
    const plan = planSync(root, reg.catalog, findConsumer(reg, 'proj'), project);
    expect(plan.items.filter((i) => i.name === 'ext').map((i) => i.action)).toEqual([
      'create-link',
      'create-link',
    ]);
    expect(plan.items.find((i) => i.name === 'ext')!.canonical).toBe(
      resolve(realpathSync(root), 'external/skills/ext'),
    );
  });

  it('a hand-written curated assignment to an unapproved release makes the registry invalid', () => {
    const { root } = curatedRepo();
    const reg = JSON.parse(readText(join(root, 'registry/consumers.json')));
    reg[0].assignments = [{ skill: 'ext', agents: ['codex'], release: '2.0.0' }];
    writeFileSync(join(root, 'registry/consumers.json'), JSON.stringify(reg));
    expect(() => loadRegistry(root)).toThrow(
      /pins ext@2.0.0, which is not installable \(release-not-approved, review-incomplete\)/,
    );
  });
});

describe('cli: preview by default, --apply to act', () => {
  const pkg = resolve(__dirname, '..');
  const TSX = join(pkg, 'node_modules/tsx/dist/cli.mjs');
  it('install previews without changing anything, applies only with --apply, and refuses unapproved releases', () => {
    const { root, project } = curatedRepo();
    cpSync(join(pkg, 'src'), join(root, 'packages/catalog/src'), { recursive: true });
    cpSync(join(pkg, 'package.json'), join(root, 'packages/catalog/package.json'));
    symlinkSync(join(pkg, 'node_modules'), join(root, 'packages/catalog/node_modules'));
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [TSX, join(root, 'packages/catalog/src/cli.ts'), ...args], {
        cwd: join(root, 'packages/catalog'),
        env: { ...process.env, INIT_CWD: root },
        encoding: 'utf8',
      });
    const before = state(root, project);
    const pv = run('library', 'install', 'proj', 'ext', '--version', '1.0.0', '--project', project);
    expect(pv.status, pv.stderr).toBe(0);
    expect(pv.stdout).toMatch(/INSTALL PREVIEW[\s\S]*No blockers\. Nothing was changed/);
    expect(state(root, project)).toEqual(before);
    expect(run('library', 'install', 'proj', 'ext', '--project', project).status).toBe(2); // version is mandatory
    const bad = run(
      'library',
      'install',
      'proj',
      'ext',
      '--version',
      '2.0.0',
      '--project',
      project,
      '--apply',
    );
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/BLOCKED/);
    expect(state(root, project)).toEqual(before);
    const ok = run(
      'library',
      'install',
      'proj',
      'ext',
      '--version',
      '1.0.0',
      '--project',
      project,
      '--apply',
    );
    expect(ok.status, ok.stderr + ok.stdout).toBe(0);
    expect(ok.stdout).toMatch(/done: linked \.claude\/skills\/ext/);
    expect(run('verify', 'proj', '--project', project).stdout).toMatch(/curated release 1.0.0/);
  }, 60_000);
});
