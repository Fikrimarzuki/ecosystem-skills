import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findConsumer, loadRegistry } from '../src/consumers.ts';
import { applyCurated, consumerInventory, planCurated } from '../src/curated.ts';
import { formatJson } from '../src/fsguard.ts';
import { installSkill, type Fetch } from '../src/install.ts';
import { verifyLibrary } from '../src/library.ts';
import { readCuratedLock } from '../src/store.ts';
import { verifyConsumer } from '../src/sync.ts';
import { applyPrepare, cleanupPlan, networkRemote, preparePlan } from '../src/upstream.ts';
import { review } from './curatedfix.ts';
import { makeRepo, SHA, tmp, write } from './fixtures.ts';

/*
 * ES22 full lifecycle in a disposable repository: discovery record → curation (prepare) → review → approval → install →
 * verify → second release → upgrade → rollback, plus the failure paths. Approvals here are synthetic and exist only in
 * the fixture. The real registry is hashed before and after to prove it is untouched.
 */
const REPO = resolve(__dirname, '../../..');
const realRegistry = () =>
  createHash('sha256')
    .update(
      readdirSync(join(REPO, 'registry'))
        .sort()
        .map((f) => f + readFileSync(join(REPO, 'registry', f), 'utf8'))
        .join('\n'),
    )
    .digest('hex');
const NEXT = 'd'.repeat(40);
const MIT =
  'MIT License\n\nCopyright (c) 2026 Org\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\n';

function archive(sha: string, body: string) {
  const d = tmp('es22-lc-tar-');
  const top = `ext-${sha}`;
  write(join(d, top, 'skills/ext/SKILL.md'), `---\nname: ext\n---\n${body}\n`);
  write(join(d, top, 'skills/ext/scripts/run.sh'), `#!/bin/sh\ntouch "${join(d, 'EXECUTED')}"\n`);
  write(join(d, top, 'LICENSE'), MIT);
  execFileSync('chmod', ['+x', join(d, top, 'skills/ext/scripts/run.sh')]);
  execFileSync('tar', ['-czf', join(d, 'a.tgz'), '-C', d, top]);
  return { buf: readFileSync(join(d, 'a.tgz')), marker: join(d, 'EXECUTED') };
}

let realBefore = '';
const originalFetch = globalThis.fetch;
beforeEach(() => {
  realBefore = realRegistry();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  expect(realRegistry()).toBe(realBefore); // the real registry was never written
});

describe('lifecycle with synthetic approvals (fixture only)', () => {
  it('runs end to end with hashes checked at every stage, no network after preparation, and no script execution', async () => {
    const { root, project } = makeRepo();
    const a1 = archive(SHA, 'version one');
    const a2 = archive(NEXT, 'version two');
    const served: string[] = [];
    const fetchImpl: Fetch = async (url) => {
      served.push(url);
      const body = url.endsWith(SHA) ? a1.buf : url.endsWith(NEXT) ? a2.buf : undefined;
      return {
        ok: !!body,
        status: body ? 200 : 404,
        arrayBuffer: async () => new Uint8Array(body ?? Buffer.alloc(0)).buffer,
      };
    };
    const remote = {
      ...networkRemote(fetchImpl),
      head: async () => SHA,
      commitDate: async () => undefined,
    };

    // 1. curation: prepare 1.0.0 from the pinned commit (data only)
    let reg = loadRegistry(root);
    const p1 = await preparePlan(
      root,
      reg.catalog,
      { skill: 'ext', version: '1.0.0', revision: SHA },
      remote,
    );
    expect(p1.blockers).toEqual([]);
    applyPrepare(root, p1, { releases: undefined, raw: reg.raw as Record<string, unknown> });
    cleanupPlan(p1);
    reg = loadRegistry(root);
    expect(verifyLibrary(root, reg.catalog)).toEqual([]);
    expect(reg.catalog.releases[0]).toMatchObject({
      version: '1.0.0',
      approval: { status: 'unapproved' },
      review: { outcome: 'not-evaluated' },
    });

    // 2. not installable before review and approval
    expect(
      planCurated(root, {
        mode: 'install',
        consumer: 'proj',
        skill: 'ext',
        version: '1.0.0',
        project,
      }).blockers.join(),
    ).toMatch(/release-not-approved/);

    // 3. synthetic review bound to the exact content, then synthetic approval (fixture only)
    const approve = (version: string) => {
      const file = join(root, 'registry/releases.json');
      const rels = JSON.parse(readFileSync(file, 'utf8'));
      const r = rels.find((x: { version: string }) => x.version === version);
      r.review = review(r.curatedHash);
      r.approval = { status: 'approved', approvedBy: 'Fixture owner', approvedAt: '2026-10-31' };
      writeFileSync(file, formatJson(rels));
    };
    approve('1.0.0');

    // from here on, any network access is a failure
    globalThis.fetch = (async () => {
      throw new Error('unexpected network request');
    }) as typeof fetch;
    const servedBefore = served.length;

    // 4. install, then verify
    applyCurated(
      planCurated(root, {
        mode: 'install',
        consumer: 'proj',
        skill: 'ext',
        version: '1.0.0',
        project,
      }),
    );
    reg = loadRegistry(root);
    const okChecks = () =>
      verifyConsumer(
        root,
        loadRegistry(root).catalog,
        findConsumer(loadRegistry(root), 'proj'),
        project,
      ).filter((c) => c.subject.includes('ext'));
    expect(okChecks().every((c) => c.level !== 'error')).toBe(true);
    const r1 = reg.catalog.releases.find((r) => r.version === '1.0.0')!;
    expect(readCuratedLock(root).lock.consumers.proj!.ext!.current).toMatchObject({
      version: '1.0.0',
      contentHash: r1.curatedHash,
    });

    // 5. second release prepared from a newer commit: it does not inherit approval
    globalThis.fetch = originalFetch;
    const p2 = await preparePlan(
      root,
      reg.catalog,
      { skill: 'ext', version: '1.1.0', revision: NEXT },
      remote,
    );
    expect(p2.notes.join()).toMatch(/does NOT inherit/);
    applyPrepare(root, p2, {
      releases: readFileSync(join(root, 'registry/releases.json'), 'utf8'),
      raw: loadRegistry(root).raw as Record<string, unknown>,
    });
    cleanupPlan(p2);
    expect(
      planCurated(root, {
        mode: 'upgrade',
        consumer: 'proj',
        skill: 'ext',
        version: '1.1.0',
        project,
      }).blockers.join(),
    ).toMatch(/release-not-approved/);
    approve('1.1.0');
    globalThis.fetch = (async () => {
      throw new Error('unexpected network request');
    }) as typeof fetch;

    // 6. upgrade, verify, rollback, verify
    applyCurated(
      planCurated(root, {
        mode: 'upgrade',
        consumer: 'proj',
        skill: 'ext',
        version: '1.1.0',
        project,
      }),
    );
    expect(realpathSync(join(project, '.claude/skills/ext'))).toBe(
      realpathSync(join(root, 'external/releases/ext/1.1.0')),
    );
    expect(okChecks().every((c) => c.level !== 'error')).toBe(true);
    applyCurated(
      planCurated(root, {
        mode: 'rollback',
        consumer: 'proj',
        skill: 'ext',
        version: '1.0.0',
        project,
      }),
    );
    expect(realpathSync(join(project, '.agents/skills/ext'))).toBe(
      realpathSync(join(root, 'external/releases/ext/1.0.0')),
    );
    expect(okChecks().every((c) => c.level !== 'error')).toBe(true);
    const inv = consumerInventory(root, 'proj', project)[0]!;
    expect(inv).toMatchObject({
      kind: 'curated',
      desired: '1.0.0',
      installed: '1.0.0',
      available: '1.1.0',
      drift: [],
    });

    // no network after preparation, no script ever executed
    expect(served.length).toBe(servedBefore + 1); // exactly one download, for preparing 1.1.0
    expect(existsSync(a1.marker) || existsSync(a2.marker)).toBe(false);
  });

  it('the legacy installer cannot be used to bypass a curated release, and curated controls do not depend on it', async () => {
    const { root, project } = makeRepo();
    // "pending" is reviewed, not approved: the legacy installer refuses it whatever releases exist
    const pending = loadRegistry(root).catalog.skills.find((s) => s.id === 'pending')!;
    await expect(
      installSkill(root, pending, async () => {
        throw new Error('no network');
      }),
    ).rejects.toThrow(/not approved/);
    // and a curated install of an unknown release never falls back to the legacy copy that exists for "ext"
    expect(
      planCurated(root, {
        mode: 'install',
        consumer: 'proj',
        skill: 'ext',
        version: '1.0.0',
        project,
      }).blockers.join(),
    ).toMatch(/no curated release 1.0.0/);
  });
});
