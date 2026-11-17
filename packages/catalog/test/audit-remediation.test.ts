import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentAvailability } from '../src/availability.ts';
import { loadRegistry } from '../src/consumers.ts';
import {
  applyCurated,
  consumerInventory,
  formatPlan,
  planCurated,
  type PlanOptions,
} from '../src/curated.ts';
import { formatJson } from '../src/fsguard.ts';
import { installSkill, readLock, rollbackSkill, type Fault, type Fetch } from '../src/install.ts';
import {
  checkPrivateRoot,
  loadWorkspace,
  PRIVATE_ENV,
  PRIVATE_MARKER,
  readPrivate,
  redactPrivate,
} from '../src/private.ts';
import type { Release, Skill } from '../src/schema.ts';
import { scanTree } from '../src/tree.ts';
import { credentialProblem, liveBlockers, readEvalKey } from '../evals/es23/isolation.ts';
import { review } from './curatedfix.ts';
import { makeRepo, privatize, tmp, write } from './fixtures.ts';

/*
 * Regression tests for the independent audit of ES23–ES25 (findings F1–F6; F7 is documentation). Every repository,
 * private root, project and "home" here is a disposable fixture; no real consumer, private root or credential is used.
 */

const mode = (p: string) => lstatSync(p).mode & 0o777;
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>[];
const patchSkill = (root: string, id: string, patch: Record<string, unknown>) => {
  const f = join(root, 'registry/skills.json');
  writeFileSync(
    f,
    formatJson(
      readJson(f).map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
        return next;
      }),
    ),
  );
};
/** Everything under a folder (names and contents), to prove that a refusal changed nothing. */
const snapshot = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true })
        .map(String)
        .sort()
        .map((f) => {
          const p = join(dir, f);
          const st = lstatSync(p);
          return `${f} ${st.isSymbolicLink() ? `-> ${readlinkSync(p)}` : st.isFile() ? readFileSync(p, 'utf8') : 'dir'}`;
        })
        .join('\n')
    : '';

/* ------------------------------------------------------------------ F1: legacy rollback */

/** makeRepo's approved, installed "ext", with a backup of the same approved revision, and a consumer link to it. */
function legacyRepo() {
  const r = makeRepo();
  const live = join(r.root, 'external/skills/ext');
  const entry = readLock({ base: join(r.root, 'external') }).ext!;
  const b = join(r.root, 'external/.backups/ext/2026-10-01T00-00-00-000Z');
  mkdirSync(dirname(b), { recursive: true });
  cpSync(live, b, { recursive: true });
  writeFileSync(`${b}.json`, JSON.stringify(entry));
  const link = join(r.project, '.claude/skills/ext');
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(relative(dirname(link), live), link);
  return { ...r, link, backup: b };
}

describe('F1 legacy rollback follows the current policy, approval and pin', () => {
  it('refuses once the distribution became restricted or not-distributable, and once approval is revoked', () => {
    for (const patch of [
      { distribution: { policy: 'restricted', access: 'authorized-consumers' } },
      { distribution: { policy: 'not-distributable' } },
      {
        review: {
          status: 'reviewed',
          reviewedAt: '2026-10-27',
          reviewer: 'r',
          revision: 'a'.repeat(40),
          contentHash: loadRegistry(makeRepo().root).catalog.skills.find((s) => s.id === 'ext')!
            .review.contentHash,
        },
      },
    ]) {
      const r = legacyRepo();
      patchSkill(r.root, 'ext', patch);
      const before = snapshot(join(r.root, 'external')) + snapshot(r.project);
      expect(() => rollbackSkill(r.root, 'ext'), JSON.stringify(patch)).toThrow(
        /restricted|not distributable|not approved/,
      );
      expect(snapshot(join(r.root, 'external')) + snapshot(r.project)).toBe(before);
    }
  });

  it('refuses a backup of a revision the registry does not approve, and restores one it does', () => {
    const r = legacyRepo();
    const entry = JSON.parse(readFileSync(`${r.backup}.json`, 'utf8'));
    writeFileSync(`${r.backup}.json`, JSON.stringify({ ...entry, revision: 'b'.repeat(40) }));
    expect(() => rollbackSkill(r.root, 'ext')).toThrow(
      /only content the registry currently approves/,
    );
    writeFileSync(`${r.backup}.json`, JSON.stringify(entry));
    expect(rollbackSkill(r.root, 'ext').revision).toBe('a'.repeat(40)); // eligible: allowed as before
    expect(readFileSync(join(r.link, 'SKILL.md'), 'utf8')).toContain('external');
  });

  it('refuses without a readable registry, and refuses symlinked or special backups', () => {
    const r = legacyRepo();
    writeFileSync(join(r.root, 'registry/skills.json'), '{ broken');
    expect(() => rollbackSkill(r.root, 'ext')).toThrow(/cannot read the registry/);
    const s = legacyRepo();
    symlinkSync('/etc/hosts', join(s.backup, 'escape'));
    expect(() => rollbackSkill(s.root, 'ext')).toThrow(/symlinks or special files/);
  });

  it('a failure at any single filesystem operation leaves the consumer, install, backups and lock byte-identical', () => {
    let completed = false;
    for (let n = 0; n < 30 && !completed; n++) {
      const r = legacyRepo();
      const before = snapshot(join(r.root, 'external')) + snapshot(r.project);
      let calls = 0;
      const ops: string[] = [];
      const fault: Fault = (op) => {
        ops.push(op);
        if (calls++ === n)
          throw Object.assign(new Error(`injected ${op} failure`), { code: 'EIO' });
      };
      try {
        rollbackSkill(r.root, 'ext', { fault });
        completed = true; // n is past the last operation: the rollback ran to the end
        expect(n).toBeGreaterThan(5);
      } catch (e) {
        expect((e as Error).message, `fault at ${ops.at(-1)} (#${n})`).toMatch(
          /everything was put back as it was \(verified\)/,
        );
        expect(snapshot(join(r.root, 'external')) + snapshot(r.project), `#${n}`).toBe(before);
        expect(readFileSync(join(r.link, 'SKILL.md'), 'utf8')).toContain('external');
      }
    }
    expect(completed).toBe(true);
  });

  it('a direct installSkill call with a forged record is refused before anything is downloaded', async () => {
    const r = makeRepo();
    patchSkill(r.root, 'other', { distribution: { policy: 'not-distributable' } });
    const forged = {
      ...loadRegistry(makeRepo().root).catalog.skills.find((s) => s.id === 'other')!,
    } as Skill; // the record as it was before the policy changed
    let fetched = false;
    const spy: Fetch = async () => {
      fetched = true;
      throw new Error('must not download');
    };
    await expect(installSkill(r.root, forged, spy, { replace: true })).rejects.toThrow(
      /other is not distributable/,
    );
    expect(fetched).toBe(false);
  });

  it('the CLI rollback is refused too', () => {
    const pkg = join(__dirname, '..');
    const r = legacyRepo();
    cpSync(join(pkg, 'src'), join(r.root, 'packages/catalog/src'), { recursive: true });
    cpSync(join(pkg, 'package.json'), join(r.root, 'packages/catalog/package.json'));
    symlinkSync(join(pkg, 'node_modules'), join(r.root, 'packages/catalog/node_modules'));
    patchSkill(r.root, 'ext', { distribution: { policy: 'not-distributable' } });
    const out = spawnSync(
      process.execPath,
      [
        join(pkg, 'node_modules/tsx/dist/cli.mjs'),
        join(r.root, 'packages/catalog/src/cli.ts'),
        'rollback',
        'ext',
      ],
      {
        cwd: join(r.root, 'packages/catalog'),
        env: { ...process.env, INIT_CWD: r.root },
        encoding: 'utf8',
      },
    );
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/ERROR: ext is not distributable/);
    expect(existsSync(r.backup)).toBe(true);
  }, 60_000);
});

/* ------------------------------------------------------------------ fixture: a restricted skill with two releases */

function fmRepo(agents: string[] = ['claude-code', 'codex']) {
  const r = makeRepo();
  write(join(r.root, 'skills/shared/fm-tool/SKILL.md'), '---\nname: fm-tool\n---\nfm\n');
  const releases = ['1.0.0', '1.1.0'].map((version) => {
    const d = join(r.root, 'library/fm-tool', version);
    write(join(d, 'SKILL.md'), `---\nname: fm-tool\n---\nfm ${version}\n`);
    const hash = scanTree(d).hash;
    return {
      skill: 'fm-tool',
      version,
      createdAt: '2026-10-30',
      path: `library/fm-tool/${version}`,
      curatedHash: hash,
      license: 'Proprietary',
      attribution: 'Owner',
      review: review(hash),
      approval: { status: 'approved', approvedBy: 'Owner', approvedAt: '2026-10-31' },
      supportedAgents: ['claude-code', 'codex'],
    };
  });
  write(join(r.root, 'registry/releases.json'), formatJson(releases));
  const skills = readJson(join(r.root, 'registry/skills.json'));
  skills.push({
    id: 'fm-tool',
    name: 'FM Tool',
    description: 'd',
    category: 'general',
    origin: 'first-party',
    source: { type: 'first-party', path: 'skills/shared/fm-tool' },
    ownership: 'fm-ecosystem',
    distribution: { policy: 'restricted', access: 'owner-only' },
  });
  write(join(r.root, 'registry/skills.json'), formatJson(skills));
  const consumers = readJson(join(r.root, 'registry/consumers.json'));
  consumers[0]!.ownership = 'fm-ecosystem';
  write(join(r.root, 'registry/consumers.json'), formatJson(consumers));
  return { ...r, agents };
}
const grant = (agents: string[], over: Record<string, unknown> = {}) => ({
  consumer: 'proj',
  skill: 'fm-tool',
  agents,
  releases: ['1.0.0', '1.1.0'],
  authorizedBy: 'Owner',
  authorizedAt: '2026-10-31',
  ...over,
});
/** A private root whose folder name is distinctive, so any leak of it is searchable. */
function vault(access: unknown[], name = 'zz-vault-7f3a9', parent?: string) {
  const dir = join(tmp('audit-'), ...(parent ? [parent] : []), name);
  mkdirSync(dir, { mode: 0o700, recursive: true });
  write(join(dir, PRIVATE_MARKER), '{ "schemaVersion": 1 }\n');
  write(join(dir, 'registry/access.json'), formatJson(access));
  return privatize(dir);
}
const plan = (r: { root: string; project: string }, p: string, over: Partial<PlanOptions> = {}) =>
  planCurated(r.root, {
    mode: 'install',
    consumer: 'proj',
    skill: 'fm-tool',
    version: '1.0.0',
    project: r.project,
    agents: ['claude-code'],
    privateRoot: p,
    ...over,
  });

/* ------------------------------------------------------------------ F2: owner-only private storage */

describe('F2 private storage is owner-only, and stays so through writes and undo', () => {
  it('root 0755 is refused and 0700 accepted; records 0644 are refused and 0600 accepted', () => {
    const r = fmRepo();
    const p = vault([grant(['claude-code'])]);
    chmodSync(p, 0o755);
    expect(() => checkPrivateRoot(r.root, p)).toThrow(
      /private root must be accessible only by its owner \(chmod 700\)/,
    );
    chmodSync(p, 0o700);
    expect(checkPrivateRoot(r.root, p)).toBe(realpathSync(p));
    chmodSync(join(p, 'registry'), 0o755);
    expect(() => readPrivate(p)).toThrow(
      /<private root>\/registry must be accessible only by its owner/,
    );
    chmodSync(join(p, 'registry'), 0o700);
    for (const [m, ok] of [
      [0o644, false],
      [0o640, false],
      [0o604, false],
      [0o600, true],
      [0o400, true],
    ] as const) {
      chmodSync(join(p, 'registry/access.json'), m);
      if (ok) expect(() => readPrivate(p), m.toString(8)).not.toThrow();
      else
        expect(() => readPrivate(p), m.toString(8)).toThrow(
          /access.json must be accessible only by its owner \(chmod 600\)/,
        );
    }
  });

  it('install writes the access record and the lock 0600 and its store folders 0700; public writes keep their mode', () => {
    const r = fmRepo();
    const p = vault([grant(['claude-code'])]);
    applyCurated(plan(r, p));
    expect(mode(join(p, 'registry/access.json'))).toBe(0o600);
    expect(mode(join(p, 'external/releases.lock.json'))).toBe(0o600);
    for (const d of ['external', 'external/releases', 'external/releases/fm-tool'])
      expect(mode(join(p, d)), d).toBe(0o700);
    expect(() => loadWorkspace(r.root, p)).not.toThrow(); // still readable under the stricter rules
    // a public curated install is unchanged: consumers.json keeps the umask default mode
    const pub = fmRepo();
    const ext = join(pub.root, 'library/ext/1.0.0');
    write(join(ext, 'SKILL.md'), '---\nname: ext\n---\nx\n');
    write(join(ext, 'LICENSE'), 'MIT License\n');
    write(join(ext, 'ATTRIBUTION.md'), '# Attribution\n');
    const h = scanTree(ext).hash;
    write(
      join(pub.root, 'registry/releases.json'),
      formatJson([
        ...readJson(join(pub.root, 'registry/releases.json')),
        {
          skill: 'ext',
          version: '1.0.0',
          createdAt: '2026-10-30',
          path: 'library/ext/1.0.0',
          upstream: {
            url: 'https://github.com/o/ext',
            path: 'skills/ext',
            revision: 'a'.repeat(40),
            contentHash: h,
          },
          curatedHash: h,
          license: 'MIT',
          attribution: 'o',
          review: review(h),
          approval: { status: 'approved', approvedBy: 'Owner', approvedAt: '2026-10-31' },
        },
      ]),
    );
    const before = mode(join(pub.root, 'registry/consumers.json'));
    const pubPlan = planCurated(pub.root, {
      mode: 'install',
      consumer: 'proj',
      skill: 'ext',
      version: '1.0.0',
      project: pub.project,
    });
    expect(pubPlan.blockers).toEqual([]);
    applyCurated(pubPlan);
    expect(mode(join(pub.root, 'registry/consumers.json'))).toBe(before);
    expect(before & 0o044).not.toBe(0); // public files stay readable, as before
  });

  it('an undo after a failure writes the access record back 0600', () => {
    for (let n = 1; n <= 4; n++) {
      const r = fmRepo();
      const p = vault([grant(['claude-code'])]);
      const before = readFileSync(join(p, 'registry/access.json'), 'utf8');
      expect(() => applyCurated(plan(r, p), { failAfter: n })).toThrow(
        /rolled back|nothing had been changed/,
      );
      expect(readFileSync(join(p, 'registry/access.json'), 'utf8')).toBe(before);
      expect(mode(join(p, 'registry/access.json')), `failAfter ${n}`).toBe(0o600);
      expect(() => loadWorkspace(r.root, p)).not.toThrow();
    }
  });
});

/* ------------------------------------------------------------------ F3: no private paths in output */

describe('F3 previews, conflicts and errors never name the private root', () => {
  const NAME = 'zz-vault-7f3a9';

  it('the preview shows <private root>/… for absolute and relative paths, and keeps the useful part', () => {
    const r = fmRepo();
    const p = vault([grant(['claude-code'])]);
    const out = formatPlan(plan(r, p));
    expect(out).not.toContain(NAME);
    expect(out).not.toContain(p);
    expect(out).toContain('content: <private root>/external/releases/fm-tool/1.0.0');
    // relative forms the caller does not name still lose the root's name (its parents are not private data)
    expect(redactPrivate(`at ${p}/x and ../../a/${NAME}/y, '${realpathSync(p)}'`, p)).toBe(
      "at <private root>/x and ../../a/<private root>/y, '<private root>'",
    );
  });

  it('a conflicting link into the private root is described without its location', () => {
    const r = fmRepo();
    const p = vault([grant(['claude-code'])]);
    const foreign = join(p, 'elsewhere/fm-tool'); // inside the private root, but not in the store this tool owns
    mkdirSync(foreign, { recursive: true });
    privatize(p);
    for (const target of [foreign, relative(join(r.project, '.claude/skills'), foreign)]) {
      const link = join(r.project, '.claude/skills/fm-tool');
      mkdirSync(dirname(link), { recursive: true });
      rmSync(link, { force: true }); // the link from the previous iteration
      symlinkSync(target, link);
      const pl = plan(r, p);
      const text = [formatPlan(pl), ...pl.blockers, ...pl.links.map((l) => l.detail)].join('\n');
      expect(pl.blockers.join()).toMatch(/symlink not owned by Ecosystem Skills/);
      expect(text, target).not.toContain(NAME);
      expect(text).toContain('<private root>/elsewhere/fm-tool');
    }
  });

  it('filesystem errors from inside the private root are reduced to a name and a code', () => {
    const r = fmRepo();
    const p = vault([grant(['claude-code'])]);
    chmodSync(join(p, 'registry/access.json'), 0o000);
    let msg = '';
    try {
      plan(r, p);
    } catch (e) {
      msg = (e as Error).message;
    }
    chmodSync(join(p, 'registry/access.json'), 0o600);
    expect(msg).toMatch(/<private root>\/registry\/access.json/);
    expect(msg).not.toContain(NAME);
    // an apply that fails on a write inside the root (store parent made read-only after the preview)
    const pl = plan(r, p);
    mkdirSync(join(p, 'external'), { mode: 0o700 });
    let err = '';
    try {
      applyCurated(pl, { afterRecheck: () => chmodSync(join(p, 'external'), 0o500) });
    } catch (e) {
      err = (e as Error).message;
    } finally {
      chmodSync(join(p, 'external'), 0o700);
    }
    expect(err).toMatch(/install failed: .*EACCES/);
    expect(err).toContain('<private root>');
    expect(err).not.toContain(NAME);
  });

  it('the CLI preview and its errors carry no private location', () => {
    const pkg = join(__dirname, '..');
    const r = fmRepo();
    cpSync(join(pkg, 'src'), join(r.root, 'packages/catalog/src'), { recursive: true });
    cpSync(join(pkg, 'package.json'), join(r.root, 'packages/catalog/package.json'));
    symlinkSync(join(pkg, 'node_modules'), join(r.root, 'packages/catalog/node_modules'));
    const p = vault([grant(['claude-code'])]);
    const run = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [
          join(pkg, 'node_modules/tsx/dist/cli.mjs'),
          join(r.root, 'packages/catalog/src/cli.ts'),
          ...args,
        ],
        {
          cwd: join(r.root, 'packages/catalog'),
          env: { ...process.env, INIT_CWD: r.root, [PRIVATE_ENV]: p },
          encoding: 'utf8',
        },
      );
    const pre = run(
      'library',
      'install',
      'proj',
      'fm-tool',
      '--version',
      '1.0.0',
      '--project',
      r.project,
      '--agents',
      'claude-code',
    );
    expect(pre.status, pre.stderr).toBe(0);
    expect(pre.stdout).toContain('<private root>/external/releases/fm-tool/1.0.0');
    chmodSync(join(p, 'registry/access.json'), 0o000);
    const bad = run(
      'library',
      'install',
      'proj',
      'fm-tool',
      '--version',
      '1.0.0',
      '--project',
      r.project,
    );
    chmodSync(join(p, 'registry/access.json'), 0o600);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/^ERROR: /);
    for (const o of [pre, bad]) expect(o.stdout + o.stderr).not.toContain(NAME);
  }, 90_000);
});

/* ------------------------------------------------------------------ F5: authorization is not activation */

describe('F5 the agents activated are recorded, never inferred from the grant', () => {
  const links = (project: string) => ({
    claude: existsSync(join(project, '.claude/skills/fm-tool')),
    codex: existsSync(join(project, '.agents/skills/fm-tool')),
  });
  const access = (p: string) => readJson(join(p, 'registry/access.json'))[0]!;

  it('a dual grant with a Claude-only install activates Claude only, and upgrade and rollback keep it that way', () => {
    const r = fmRepo();
    const p = vault([grant(['claude-code', 'codex'])]);
    applyCurated(plan(r, p, { agents: ['claude-code'] }));
    expect(access(p)).toMatchObject({ release: '1.0.0', activeAgents: ['claude-code'] });
    expect(links(r.project)).toEqual({ claude: true, codex: false });
    const ws = loadWorkspace(r.root, p);
    expect(
      ws.catalog.consumers
        .find((x) => x.id === 'proj')!
        .assignments.find((a) => a.skill === 'fm-tool')!.agents,
    ).toEqual(['claude-code']);
    const up = plan(r, p, { mode: 'upgrade', version: '1.1.0', agents: undefined });
    expect(up.agents).toEqual(['claude-code']);
    applyCurated(up);
    applyCurated(plan(r, p, { mode: 'rollback', version: '1.0.0', agents: undefined }));
    expect(links(r.project)).toEqual({ claude: true, codex: false });
    expect(access(p).activeAgents).toEqual(['claude-code']);
    expect(
      consumerInventory(r.root, 'proj', r.project, p).find((x) => x.skill === 'fm-tool'),
    ).toMatchObject({
      agents: ['claude-code'],
      installed: '1.0.0',
      drift: [],
    });
    // a wider --agents on upgrade cannot quietly activate Codex
    expect(
      plan(r, p, {
        mode: 'upgrade',
        version: '1.1.0',
        agents: ['claude-code', 'codex'],
      }).blockers.join(),
    ).toMatch(/upgrade and rollback move every active agent together/);
  });

  it('Codex-only and dual installs; a Claude-only grant refuses Codex', () => {
    const c = fmRepo();
    const pc = vault([grant(['codex'])]);
    applyCurated(plan(c, pc, { agents: ['codex'] }));
    expect(links(c.project)).toEqual({ claude: false, codex: true });
    expect(access(pc).activeAgents).toEqual(['codex']);
    const d = fmRepo();
    const pd = vault([grant(['claude-code', 'codex'])]);
    applyCurated(plan(d, pd, { agents: ['claude-code', 'codex'] }));
    expect(links(d.project)).toEqual({ claude: true, codex: true });
    expect(access(pd).activeAgents).toEqual(['claude-code', 'codex']);
    const o = fmRepo();
    expect(plan(o, vault([grant(['claude-code'])]), { agents: ['codex'] }).blockers.join()).toMatch(
      /proj is not authorized to use fm-tool with codex/,
    );
  });

  it('revoking an active agent blocks further changes, leaves the link, and is reported; it never broadens', () => {
    const r = fmRepo();
    const p = vault([grant(['claude-code', 'codex'])]);
    applyCurated(plan(r, p, { agents: ['claude-code', 'codex'] }));
    const f = join(p, 'registry/access.json');
    writeFileSync(f, formatJson([{ ...access(p), agents: ['claude-code'] }]));
    expect(
      plan(r, p, { mode: 'upgrade', version: '1.1.0', agents: undefined }).blockers.join(),
    ).toMatch(/not authorized to use fm-tool with codex/);
    expect(links(r.project)).toEqual({ claude: true, codex: true }); // not removed
    expect(
      consumerInventory(r.root, 'proj', r.project, p)
        .find((x) => x.skill === 'fm-tool')!
        .drift.join(),
    ).toMatch(/codex is active but no longer authorized: its link is left in place/);
  });

  it('full revocation: status still lists the install from its tracking, and the links it left', () => {
    const r = fmRepo();
    const p = vault([grant(['claude-code', 'codex'])]);
    applyCurated(plan(r, p, { agents: ['claude-code', 'codex'] }));
    writeFileSync(join(p, 'registry/access.json'), '[]\n'); // every grant removed
    const row = consumerInventory(r.root, 'proj', r.project, p).find((x) => x.skill === 'fm-tool');
    expect(row).toMatchObject({
      restricted: true,
      authorization: 'revoked',
      desired: 'none',
      agents: [],
      installed: '1.0.0',
      links: [
        { agent: 'claude-code', target: '1.0.0' },
        { agent: 'codex', target: '1.0.0' },
      ],
    });
    expect(row!.drift.join()).toMatch(
      /nothing changes it automatically: remove the link\(s\) by hand/,
    );
    expect(links(r.project)).toEqual({ claude: true, codex: true }); // never deleted
    // without the project location the row is still there, saying the links were not inspected
    expect(
      consumerInventory(r.root, 'proj', undefined, p)
        .find((x) => x.skill === 'fm-tool')!
        .drift.join(),
    ).toMatch(/links not inspected/);
    // and the three states are separate on a partially revoked row
    const q = fmRepo();
    const p2 = vault([grant(['claude-code', 'codex'])]);
    applyCurated(plan(q, p2, { agents: ['claude-code', 'codex'] }));
    writeFileSync(
      join(p2, 'registry/access.json'),
      formatJson([{ ...access(p2), agents: ['claude-code'] }]),
    );
    expect(
      consumerInventory(q.root, 'proj', q.project, p2).find((x) => x.skill === 'fm-tool'),
    ).toMatchObject({
      authorization: 'partially-revoked',
      desired: '1.0.0',
      agents: ['claude-code', 'codex'],
      links: [
        { agent: 'claude-code', target: '1.0.0' },
        { agent: 'codex', target: '1.0.0' },
      ],
    });
  });

  it('a desired release without the agents actually activated is invalid', () => {
    const r = fmRepo();
    expect(() =>
      loadWorkspace(r.root, vault([grant(['claude-code'], { release: '1.0.0' })])),
    ).toThrow(/"release" and "activeAgents" go together/);
    expect(() =>
      loadWorkspace(r.root, vault([grant(['claude-code'], { activeAgents: ['claude-code'] })])),
    ).toThrow(/"release" and "activeAgents" go together/);
  });
});

/* ------------------------------------------------------------------ F4: evaluation credentials */

describe('F4 the evaluation key is checked by its real location and read from the checked file', () => {
  const env = (file: string) => ({ ES23_EVAL_OPENAI_KEY_FILE: file });
  /** A synthetic home with a synthetic "personal" credential; never the real one. */
  const home = () => {
    const h = tmp('audit-home-');
    write(join(h, '.codex/auth.json'), 'SYNTHETIC-PERSONAL-NOT-A-KEY\n');
    chmodSync(join(h, '.codex/auth.json'), 0o600);
    return h;
  };

  it('refuses a personal location reached through a symlinked parent, a symlinked file or a hard link', () => {
    const h = home();
    const out = tmp('audit-out-');
    symlinkSync(join(h, '.codex'), join(out, 'keys'));
    expect(credentialProblem('codex', env(join(out, 'keys/auth.json')), h)).toMatch(
      /personal credential location/,
    );
    symlinkSync(join(h, '.codex/auth.json'), join(out, 'k.env'));
    expect(credentialProblem('codex', env(join(out, 'k.env')), h)).toMatch(
      /personal credential location/,
    );
    linkSync(join(h, '.codex/auth.json'), join(out, 'hard.env'));
    expect(credentialProblem('codex', env(join(out, 'hard.env')), h)).toMatch(/other hard links/);
    // a home that is itself reached through a symlink
    const alias = join(tmp('audit-alias-'), 'home');
    symlinkSync(h, alias);
    expect(credentialProblem('codex', env(join(h, '.codex/auth.json')), alias)).toMatch(
      /personal credential location/,
    );
  });

  it('refuses any symlink on the way, even to an ordinary folder', () => {
    const h = home();
    const real = tmp('audit-real-');
    write(join(real, 'k.env'), 'OPENAI_API_KEY=placeholder\n');
    chmodSync(join(real, 'k.env'), 0o600);
    const out = tmp('audit-out-');
    symlinkSync(real, join(out, 'dir'));
    expect(credentialProblem('codex', env(join(out, 'dir/k.env')), h)).toMatch(/by its real path/);
  });

  it('a parent folder swapped between the check and the read never yields the other file (issue 5)', () => {
    const h = home();
    write(join(h, '.codex/k.env'), 'SYNTHETIC-PERSONAL-NOT-A-KEY\n');
    chmodSync(join(h, '.codex/k.env'), 0o600);
    const base = tmp('audit-swap-');
    const keys = join(base, 'keys');
    write(join(keys, 'k.env'), 'OPENAI_API_KEY=placeholder\n');
    chmodSync(join(keys, 'k.env'), 0o600);
    const e = env(join(keys, 'k.env'));
    expect(credentialProblem('codex', e, h)).toBeUndefined(); // the path is valid when checked
    const toPersonal = () => {
      renameSync(keys, join(base, 'keys.real'));
      symlinkSync(join(h, '.codex'), keys);
    };
    const back = () => {
      rmSync(keys);
      renameSync(join(base, 'keys.real'), keys);
    };
    // swapped to the personal folder before the open: refused, and the personal file is not returned
    expect(() => readEvalKey('codex', e, h, { beforeOpen: toPersonal })).toThrow(
      /personal credential location; .*nothing was read/,
    );
    back();
    // swapped before the open and swapped back right after it: the opened file is not the one the path names
    expect(() => readEvalKey('codex', e, h, { beforeOpen: toPersonal, afterOpen: back })).toThrow(
      /changed while it was being opened; nothing was read/,
    );
    // swapped to another ordinary folder holding a file of the same name, then back: refused the same way
    const other = tmp('audit-other-');
    write(join(other, 'k.env'), 'OTHER\n');
    chmodSync(join(other, 'k.env'), 0o600);
    expect(() =>
      readEvalKey('codex', e, h, {
        beforeOpen: () => {
          renameSync(keys, join(base, 'keys.real'));
          symlinkSync(other, keys);
        },
        afterOpen: back,
      }),
    ).toThrow(/changed while it was being opened/);
    // untouched: the dedicated key is read
    expect(readEvalKey('codex', e, h)).toBe('OPENAI_API_KEY=placeholder');
  });

  it('an ordinary dedicated key file passes, and is read from the checked file descriptor', () => {
    const h = home();
    const d = tmp('audit-key-');
    write(join(d, 'k.env'), 'OPENAI_API_KEY=placeholder\n');
    chmodSync(join(d, 'k.env'), 0o600);
    expect(credentialProblem('codex', env(join(d, 'k.env')), h)).toBeUndefined();
    expect(readEvalKey('codex', env(join(d, 'k.env')), h)).toBe('OPENAI_API_KEY=placeholder');
    chmodSync(join(d, 'k.env'), 0o644);
    expect(() => readEvalKey('codex', env(join(d, 'k.env')), h)).toThrow(/chmod 600/);
    // the live gate still lists every other condition
    expect(
      liveBlockers(
        'codex',
        {
          docker: true,
          isolationVerified: true,
          agentImage: false,
          ownerAuthorized: false,
          reviewed: true,
        },
        env(join(d, 'k.env')),
      ),
    ).toEqual(expect.arrayContaining(['the owner has not authorized live runs and their cost']));
  });
});

/* ------------------------------------------------------------------ F6: first-party curated releases */

describe('F6 a first-party skill with a curated release is shown by that release', () => {
  const r = fmRepo();
  const c = loadRegistry(r.root).catalog;
  const fm = c.skills.find((s) => s.id === 'fm-tool')!;
  const rel = (status: Release['approval']['status']) =>
    c.releases
      .filter((x) => x.skill === 'fm-tool')
      .map((x) => ({
        ...x,
        approval:
          status === 'unapproved'
            ? { status }
            : { status, approvedBy: 'Owner', approvedAt: '2026-10-31' },
      })) as Release[];

  it('approved, unapproved and withdrawn releases; no release stays first-party', () => {
    expect(contentAvailability(fm, rel('approved'))).toMatchObject({
      state: 'curated-approved',
      release: { version: '1.1.0' },
    });
    expect(contentAvailability(fm, rel('unapproved'))).toMatchObject({
      state: 'curated-unapproved',
      release: { version: '1.1.0' },
    });
    expect(contentAvailability(fm, rel('withdrawn')).state).toBe('curated-unapproved');
    expect(contentAvailability(fm, []).state).toBe('first-party');
    const fp = c.skills.find((s) => s.id === 'fp')!;
    expect(contentAvailability(fp, c.releases).state).toBe('first-party');
  });
});

/* ------------------------------------------------------------------ issue 4: structural redaction */

describe('private paths with spaces and punctuation never reach output (structural redaction)', () => {
  const CANARY = /Canary|Vault|7f3a/;
  const names = ['Zz Vault Canary 7f3a', 'Zz (Vault), Canary; 7f3a!'];
  const PARENT = 'Parent Canary Dir';

  it('previews, conflicts, apply results and errors show <private root>/… and never the names', () => {
    for (const name of names) {
      const r = fmRepo();
      const p = vault([grant(['claude-code'])], name, PARENT);
      const pl = plan(r, p);
      const out = formatPlan(pl);
      expect(out, name).not.toMatch(CANARY);
      expect(out).toContain('content: <private root>/external/releases/fm-tool/1.0.0');
      // apply results
      const done = applyCurated(pl).applied.join('\n');
      expect(done, name).not.toMatch(CANARY);
      expect(done).toContain('stored <private root>/external/releases/fm-tool/1.0.0');
      // conflicts: absolute and relative links into the root, outside the store this tool owns
      const foreign = join(p, 'elsewhere/x');
      mkdirSync(foreign, { recursive: true });
      privatize(p);
      for (const target of [foreign, relative(join(r.project, '.agents/skills'), foreign)]) {
        const link = join(r.project, '.agents/skills/fm-tool');
        mkdirSync(dirname(link), { recursive: true });
        rmSync(link, { force: true });
        symlinkSync(target, link);
        const c = plan(r, p, { mode: 'upgrade', version: '1.1.0', agents: undefined });
        const text = [formatPlan(c), ...c.blockers, ...c.links.map((l) => l.detail)].join('\n');
        expect(text, `${name} ${target}`).not.toMatch(CANARY);
        rmSync(link, { force: true });
      }
      // filesystem errors raised inside the root during an apply
      const q = fmRepo();
      const p2 = vault([grant(['claude-code'])], name, PARENT);
      const pl2 = plan(q, p2);
      mkdirSync(join(p2, 'external'), { mode: 0o700 });
      let err = '';
      try {
        applyCurated(pl2, { afterRecheck: () => chmodSync(join(p2, 'external'), 0o500) });
      } catch (e) {
        err = (e as Error).message;
      } finally {
        chmodSync(join(p2, 'external'), 0o700);
      }
      expect(err).toMatch(/EACCES/);
      expect(err, name).not.toMatch(CANARY);
      // and read errors
      chmodSync(join(p2, 'registry/access.json'), 0o000);
      let read = '';
      try {
        plan(q, p2);
      } catch (e) {
        read = (e as Error).message;
      }
      chmodSync(join(p2, 'registry/access.json'), 0o600);
      expect(read).toContain('<private root>/registry/access.json');
      expect(read, name).not.toMatch(CANARY);
    }
  });

  it('the CLI preview of a root whose name has spaces carries no part of it', () => {
    const pkg = join(__dirname, '..');
    const r = fmRepo();
    cpSync(join(pkg, 'src'), join(r.root, 'packages/catalog/src'), { recursive: true });
    cpSync(join(pkg, 'package.json'), join(r.root, 'packages/catalog/package.json'));
    symlinkSync(join(pkg, 'node_modules'), join(r.root, 'packages/catalog/node_modules'));
    const p = vault([grant(['claude-code'])], names[0], PARENT);
    const out = spawnSync(
      process.execPath,
      [
        join(pkg, 'node_modules/tsx/dist/cli.mjs'),
        join(r.root, 'packages/catalog/src/cli.ts'),
        ...[
          'library',
          'install',
          'proj',
          'fm-tool',
          '--version',
          '1.0.0',
          '--project',
          r.project,
          '--agents',
          'claude-code',
        ],
      ],
      {
        cwd: join(r.root, 'packages/catalog'),
        env: { ...process.env, INIT_CWD: r.root, [PRIVATE_ENV]: p },
        encoding: 'utf8',
      },
    );
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout).toContain('<private root>/external/releases/fm-tool/1.0.0');
    expect(out.stdout + out.stderr).not.toMatch(CANARY);
  }, 60_000);
});
