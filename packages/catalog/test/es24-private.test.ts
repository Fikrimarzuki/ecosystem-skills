import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../src/consumers.ts';
import { applyCurated, planCurated } from '../src/curated.ts';
import { formatJson } from '../src/fsguard.ts';
import {
  accessProblems,
  checkPrivateRoot,
  loadWorkspace,
  PRIVATE_ENV,
  PRIVATE_MARKER,
  readPrivate,
  resolvePrivateRoot,
} from '../src/private.ts';
import { buildCatalog, catalogToJson } from '../src/validate.ts';
import { formatVisibility, visibilityRows } from '../src/ecosystem.ts';
import { scanTree } from '../src/tree.ts';
import { review } from './curatedfix.ts';
import { makeRepo, privatize, tmp, write } from './fixtures.ts';

/*
 * ES24 private skills. All private data here is synthetic and carries MARKER, so any leak is detectable by search.
 */
const MARKER = 'PRIVATE-MARKER-9c1e7b';

/** A private root next to (never inside) a disposable public repository. */
function privateRoot(
  opts: { access?: unknown[]; versions?: { version: string; approved: boolean }[] } = {},
) {
  const dir = tmp('es24-private-');
  chmodSync(dir, 0o700);
  write(join(dir, PRIVATE_MARKER), '{ "schemaVersion": 1 }\n');
  const versions = opts.versions ?? [
    { version: '1.0.0', approved: true },
    { version: '1.1.0', approved: true },
    { version: '2.0.0', approved: false },
  ];
  const releases = versions.map(({ version, approved }) => {
    const d = join(dir, 'library/secret-helper', version);
    write(join(d, 'SKILL.md'), `---\nname: secret-helper\n---\n${MARKER} ${version}\n`);
    write(join(d, 'LICENSE'), 'Proprietary, owner only\n');
    const hash = scanTree(d).hash;
    return {
      skill: 'secret-helper',
      version,
      createdAt: '2026-10-30',
      path: `library/secret-helper/${version}`,
      curatedHash: hash,
      license: 'Proprietary',
      attribution: `Owner ${MARKER}`,
      review: approved ? review(hash) : { outcome: 'not-evaluated' },
      approval: approved
        ? { status: 'approved', approvedBy: 'Owner', approvedAt: '2026-10-31' }
        : { status: 'unapproved' },
      supportedAgents: ['claude-code'],
    };
  });
  write(
    join(dir, 'registry/skills.json'),
    formatJson([
      {
        id: 'secret-helper',
        name: `Secret Helper ${MARKER}`,
        description: `Internal workflow ${MARKER}`,
        category: 'general',
        origin: 'first-party',
        source: { type: 'first-party', path: 'skills/secret-helper' },
      },
    ]),
  );
  write(
    join(dir, 'local/skills.json'),
    formatJson([
      {
        id: 'machine-note',
        name: `Machine note ${MARKER}`,
        description: 'stays here',
        category: 'general',
        origin: 'first-party',
        source: { type: 'first-party', path: 'skills/machine-note' },
      },
    ]),
  );
  write(join(dir, 'registry/releases.json'), formatJson(releases));
  write(
    join(dir, 'registry/access.json'),
    formatJson(
      opts.access ?? [
        {
          consumer: 'proj',
          skill: 'secret-helper',
          agents: ['claude-code'],
          releases: ['1.0.0', '1.1.0'],
          authorizedBy: 'Owner',
          authorizedAt: '2026-10-31',
        },
      ],
    ),
  );
  return privatize(dir);
}

const everything = (dir: string): string =>
  existsSync(dir)
    ? scanTree(dir)
        .files.map((f) => readFileSync(join(dir, f.path), 'utf8'))
        .join('\n')
    : '';

describe('ES24 visibility in the public registry', () => {
  it('absent visibility means public, and public catalog output is unchanged by the field', () => {
    const { root } = makeRepo();
    const c = loadRegistry(root).catalog;
    expect(c.skills.every((s) => s.visibility === undefined)).toBe(true);
    expect(catalogToJson(c)).not.toContain('"visibility"');
  });

  it('refuses any private or local record in the public registry (exclusion before generation)', () => {
    const { root } = makeRepo();
    const reg = loadRegistry(root).raw as Record<string, Record<string, unknown>[]>;
    for (const v of ['private', 'local']) {
      const r = buildCatalog({
        ...reg,
        skills: reg.skills!.map((s, i) => (i === 0 ? { ...s, visibility: v } : s)),
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join()).toMatch(/not allowed in the public registry/);
    }
    const src = buildCatalog({
      ...reg,
      sources: [
        {
          id: 's',
          name: 's',
          batch: 'original',
          kind: 'lead',
          resolution: 'unresolved',
          decision: 'unresolved',
          summary: 's',
          discoveredAt: '2026-10-30',
          visibility: 'private',
        },
      ],
    });
    expect(src.ok).toBe(false);
  });
});

describe('ES24 private root configuration', () => {
  it('is off unless configured; there is no default location', () => {
    const { root } = makeRepo();
    expect(resolvePrivateRoot(root, {})).toBeUndefined();
  });

  it('accepts a marked, private, real directory outside the repository (env or private.local.json)', () => {
    const { root } = makeRepo();
    const p = privateRoot();
    expect(resolvePrivateRoot(root, { [PRIVATE_ENV]: p })).toBe(p);
    writeFileSync(join(root, 'private.local.json'), JSON.stringify({ root: p }));
    expect(resolvePrivateRoot(root, {})).toBe(p);
  });

  it('refuses unsafe locations', () => {
    const { root } = makeRepo();
    const p = privateRoot();
    const cases: [string, RegExp][] = [];
    cases.push(['relative/dir', /absolute/]);
    const link = join(tmp('es24-l-'), 'link');
    symlinkSync(p, link);
    cases.push([link, /symlink/]);
    const inside = join(root, 'private');
    mkdirSync(inside);
    write(join(inside, PRIVATE_MARKER), '{}');
    cases.push([inside, /outside this public repository/]);
    const open = tmp('es24-open-');
    write(join(open, PRIVATE_MARKER), '{}');
    chmodSync(open, 0o777);
    cases.push([open, /accessible only by its owner \(chmod 700\)/]);
    const unmarked = tmp('es24-unmarked-');
    chmodSync(unmarked, 0o700);
    cases.push([unmarked, /marker/]);
    cases.push(['/', /filesystem root/]);
    for (const [dir, re] of cases) expect(() => checkPrivateRoot(root, dir), dir).toThrow(re);
    const home = tmp('es24-home-');
    chmodSync(home, 0o700);
    write(join(home, PRIVATE_MARKER), '{}');
    expect(() => checkPrivateRoot(root, home, home)).toThrow(/home directory/);
  });
});

describe('ES24 private records', () => {
  it('labels unlabelled private records private (local in local/), and refuses public ones there', () => {
    const p = privateRoot();
    const d = readPrivate(p);
    expect(d.skills.map((s) => [s.id, s.visibility])).toEqual([
      ['secret-helper', 'private'],
      ['machine-note', 'local'],
    ]);
    expect(d.releases.every((r) => r.visibility === 'private')).toBe(true);
    const skills = JSON.parse(readFileSync(join(p, 'registry/skills.json'), 'utf8'));
    writeFileSync(
      join(p, 'registry/skills.json'),
      JSON.stringify([{ ...skills[0], visibility: 'public' }]),
    );
    expect(() => readPrivate(p)).toThrow(/visibility "public" is not allowed here/);
  });

  it('refuses symlinked registry files and folders in the private root', () => {
    const p = privateRoot();
    const elsewhere = join(tmp('es24-x-'), 'skills.json');
    writeFileSync(elsewhere, '[]');
    rmSync(join(p, 'registry/skills.json'));
    symlinkSync(elsewhere, join(p, 'registry/skills.json'));
    expect(() => readPrivate(p)).toThrow(/must be a regular file/);
    const q = privateRoot();
    rmSync(join(q, 'local'), { recursive: true });
    symlinkSync(tmp('es24-y-'), join(q, 'local'));
    expect(() => readPrivate(q)).toThrow(/must be a plain directory/);
  });

  it('merges into a local workspace without touching the public registry; ids may not collide', () => {
    const { root } = makeRepo();
    const before = readFileSync(join(root, 'registry/consumers.json'), 'utf8');
    const ws = loadWorkspace(root, privateRoot());
    expect(ws.catalog.skills.map((s) => s.id)).toContain('secret-helper');
    expect(ws.public.catalog.skills.map((s) => s.id)).not.toContain('secret-helper');
    expect(readFileSync(join(root, 'registry/consumers.json'), 'utf8')).toBe(before);
    const p = privateRoot();
    const skills = JSON.parse(readFileSync(join(p, 'registry/skills.json'), 'utf8'));
    writeFileSync(join(p, 'registry/skills.json'), JSON.stringify([{ ...skills[0], id: 'ext' }]));
    expect(() => loadWorkspace(root, p)).toThrow(/collides with a public skill/);
  });

  it('a private release must belong to a private skill, and a private skill has no public release', () => {
    const { root } = makeRepo();
    const reg = loadRegistry(root).raw as Record<string, Record<string, unknown>[]>;
    const rel = {
      skill: 'ext',
      version: '1.0.0',
      createdAt: '2026-10-30',
      path: 'library/ext/1.0.0',
      upstream: {
        url: 'https://github.com/o/ext',
        path: 'skills/ext',
        revision: 'a'.repeat(40),
        contentHash: `sha256-${'d'.repeat(64)}`,
      },
      curatedHash: `sha256-${'d'.repeat(64)}`,
      license: 'MIT',
      attribution: 'o',
      visibility: 'private',
    };
    const r = buildCatalog({ ...reg, releases: [rel] }, { scope: 'workspace' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/private release of a public skill/);
  });

  it('access records are explicit: no unknown, global or public targets, no unknown versions', () => {
    const { root } = makeRepo();
    const ws = loadWorkspace(root, privateRoot());
    const base = {
      consumer: 'proj',
      skill: 'secret-helper',
      agents: ['claude-code' as const],
      releases: ['1.0.0'],
      authorizedBy: 'Owner',
      authorizedAt: '2026-10-31',
    };
    const p = accessProblems(ws.catalog, [
      { ...base, consumer: 'nobody' },
      { ...base, consumer: 'glob' },
      { ...base, skill: 'ext' },
      { ...base, consumer: 'bare', releases: ['9.9.9'] },
      { ...base, release: '1.1.0' },
      base,
    ]);
    const all = p.join('\n');
    expect(all).toMatch(/nobody\/secret-helper: unknown consumer/);
    expect(all).toMatch(/global consumers cannot be authorized/);
    expect(all).toMatch(/ext is public/);
    expect(all).toMatch(/unknown release secret-helper@9.9.9/);
    expect(all).toMatch(/desired release 1.1.0 is not among the authorized versions/);
    expect(all).toMatch(/listed more than once/);
  });

  it('the visibility view never prints descriptions or source locations of private skills', () => {
    const { root } = makeRepo();
    const ws = loadWorkspace(root, privateRoot());
    const out = formatVisibility(visibilityRows(ws), true);
    expect(out).toMatch(/secret-helper +\[private\]/);
    expect(out).toMatch(/machine-note +\[local\]/);
    expect(out).not.toContain('Internal workflow');
    expect(out).not.toContain('skills/secret-helper');
    expect(out).not.toMatch(/\/private\/|\/var\/folders|\/tmp\//);
  });
});

describe('ES24 permission-aware private installs (fixture only)', () => {
  const plan = (
    root: string,
    project: string,
    privateRoot: string | undefined,
    over: Record<string, unknown> = {},
  ) =>
    planCurated(root, {
      mode: 'install',
      consumer: 'proj',
      skill: 'secret-helper',
      version: '1.0.0',
      project,
      agents: ['claude-code'],
      privateRoot,
      ...over,
    });

  it('without a private root the skill does not exist', () => {
    const { root, project } = makeRepo();
    expect(() => plan(root, project, undefined)).toThrow(/unknown skill "secret-helper"/);
  });

  it('refuses unauthorized consumers, versions and agents, and unapproved releases even when authorized', () => {
    const { root, project } = makeRepo();
    const p = privateRoot();
    expect(plan(root, project, p, { consumer: 'bare', agents: ['codex'] }).blockers.join()).toMatch(
      /bare is not authorized for private skill secret-helper/,
    );
    expect(plan(root, project, p, { version: '1.1.0', agents: ['codex'] }).blockers.join()).toMatch(
      /not authorized to use secret-helper with codex/,
    );
    const v2 = plan(root, project, p, { version: '2.0.0' }).blockers.join();
    expect(v2).toMatch(/not authorized for secret-helper@2.0.0/);
    expect(v2).toMatch(/release-not-approved/);
    // authorizing the unapproved version does not bypass review or approval
    const q = privateRoot({
      access: [
        {
          consumer: 'proj',
          skill: 'secret-helper',
          agents: ['claude-code'],
          releases: ['1.0.0', '2.0.0'],
          authorizedBy: 'Owner',
          authorizedAt: '2026-10-31',
        },
      ],
    });
    const b = plan(root, project, q, { version: '2.0.0' }).blockers.join();
    expect(b).toMatch(/release-not-approved/);
    expect(b).toMatch(/review-incomplete/);
    expect(b).not.toMatch(/not authorized/);
    expect(() => applyCurated(plan(root, project, q, { version: '2.0.0' }))).toThrow(/refused/);
  });

  it('refuses tampered or symlinked private library content', () => {
    const { root, project } = makeRepo();
    const p = privateRoot();
    writeFileSync(join(p, 'library/secret-helper/1.0.0/SKILL.md'), 'changed\n');
    expect(plan(root, project, p).blockers.join()).toMatch(/does not match the recorded/);
    const q = privateRoot();
    const real = join(tmp('es24-lib-'), 'v');
    mkdirSync(real);
    rmSync(join(q, 'library/secret-helper/1.0.0'), { recursive: true });
    symlinkSync(real, join(q, 'library/secret-helper/1.0.0'));
    expect(plan(root, project, q).blockers.join()).toMatch(/not a plain directory/);
  });

  it('install, upgrade and rollback keep content, store, lock and desired state in the private root', () => {
    const { root, project } = makeRepo();
    const p = privateRoot();
    const publicBefore = everything(join(root, 'registry'));
    const i = plan(root, project, p);
    expect(i.blockers).toEqual([]);
    expect(i.notes.join()).toMatch(/keep agent skill links for private skills out of/);
    applyCurated(i);
    const link = join(project, '.claude/skills/secret-helper');
    expect(realpathSync(link)).toBe(join(p, 'external/releases/secret-helper/1.0.0'));
    expect(readlinkSync(link).startsWith('/')).toBe(false); // relative link
    expect(scanTree(link).hash).toBe(i.targetHash);
    expect(JSON.parse(readFileSync(join(p, 'registry/access.json'), 'utf8'))[0].release).toBe(
      '1.0.0',
    );
    expect(existsSync(join(p, 'external/releases.lock.json'))).toBe(true);
    // nothing private reached the public repository
    expect(everything(join(root, 'registry'))).toBe(publicBefore);
    expect(existsSync(join(root, 'external/releases'))).toBe(false);
    expect(everything(root)).not.toContain(MARKER);

    const up = planCurated(root, {
      mode: 'upgrade',
      consumer: 'proj',
      skill: 'secret-helper',
      version: '1.1.0',
      project,
      privateRoot: p,
    });
    expect(up.blockers).toEqual([]);
    applyCurated(up);
    expect(readFileSync(join(link, 'SKILL.md'), 'utf8')).toContain('1.1.0');
    const back = planCurated(root, {
      mode: 'rollback',
      consumer: 'proj',
      skill: 'secret-helper',
      version: '1.0.0',
      project,
      privateRoot: p,
    });
    expect(back.blockers).toEqual([]);
    applyCurated(back);
    expect(readFileSync(join(link, 'SKILL.md'), 'utf8')).toContain('1.0.0');
    expect(JSON.parse(readFileSync(join(p, 'registry/access.json'), 'utf8'))[0].release).toBe(
      '1.0.0',
    );
    const lock = JSON.parse(readFileSync(join(p, 'external/releases.lock.json'), 'utf8'));
    expect(
      lock.consumers.proj['secret-helper'].history.map(
        (h: { version: string; action: string }) => `${h.action} ${h.version}`,
      ),
    ).toEqual(['install 1.0.0', 'upgrade 1.1.0', 'rollback 1.0.0']);
    expect(everything(join(root, 'registry'))).toBe(publicBefore);
  });

  it('a failure part-way rolls back the private access record and the store', () => {
    const { root, project } = makeRepo();
    const p = privateRoot();
    const accessBefore = readFileSync(join(p, 'registry/access.json'), 'utf8');
    expect(() => applyCurated(plan(root, project, p), { failAfter: 3 })).toThrow(/rolled back/);
    expect(readFileSync(join(p, 'registry/access.json'), 'utf8')).toBe(accessBefore);
    expect(existsSync(join(p, 'external/releases/secret-helper/1.0.0'))).toBe(false);
    expect(existsSync(join(project, '.claude/skills/secret-helper'))).toBe(false);
  });

  it('a concurrent change to the access record is refused', () => {
    const { root, project } = makeRepo();
    const p = privateRoot();
    const pl = plan(root, project, p);
    const f = join(p, 'registry/access.json');
    writeFileSync(f, readFileSync(f, 'utf8').replace('2026-10-31', '2026-11-01'));
    expect(() => applyCurated(pl)).toThrow(/changed since the preview/);
  });
});

describe('ES24 CLI (real cli.ts in a fixture repository)', () => {
  const pkg = join(__dirname, '..');
  const TSX = join(pkg, 'node_modules/tsx/dist/cli.mjs');
  const cliRepo = () => {
    const r = makeRepo();
    cpSync(join(pkg, 'src'), join(r.root, 'packages/catalog/src'), { recursive: true });
    cpSync(join(pkg, 'package.json'), join(r.root, 'packages/catalog/package.json'));
    symlinkSync(join(pkg, 'node_modules'), join(r.root, 'packages/catalog/node_modules'));
    return r;
  };
  const run = (root: string, env: Record<string, string>, ...args: string[]) =>
    spawnSync(process.execPath, [TSX, join(root, 'packages/catalog/src/cli.ts'), ...args], {
      cwd: join(root, 'packages/catalog'),
      env: { ...process.env, INIT_CWD: root, ...env },
      encoding: 'utf8',
    });

  it('visibility and map show private skills locally without paths or descriptions; validate stays public', () => {
    const { root } = cliRepo();
    const p = privateRoot();
    const env = { [PRIVATE_ENV]: p };
    const v = run(root, env, 'visibility');
    expect(v.status, v.stderr).toBe(0);
    expect(v.stdout).toMatch(
      /secret-helper +\[private\].*consumers: proj \(versions 1\.0\.0, 1\.1\.0; agents claude-code\)/,
    );
    expect(v.stdout).toContain('Private library valid: 3 release(s).');
    const m = run(root, env, 'map', 'proj');
    expect(m.status, m.stderr).toBe(0);
    expect(m.stdout).toContain('secret-helper (private)');
    for (const out of [v.stdout + v.stderr, m.stdout + m.stderr]) {
      expect(out).not.toContain(p);
      expect(out).not.toContain('Internal workflow');
    }
    const val = run(root, env, 'validate');
    expect(val.status, val.stderr).toBe(0);
    expect(val.stdout).toMatch(/Registry valid: 5 skills/);
    expect(val.stdout + val.stderr).not.toContain(MARKER);
    // without a private root, the private skill does not exist
    expect(run(root, {}, 'visibility', 'secret-helper').status).toBe(2);
    // an unsafe configuration is refused with a message, not a stack trace
    const bad = run(root, { [PRIVATE_ENV]: 'relative/path' }, 'visibility');
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/ERROR: the private root must be an absolute path/);
  }, 60_000);

  it('private.local.json and sources.local.json are git-ignored', () => {
    const ignore = readFileSync(join(__dirname, '../../../.gitignore'), 'utf8').split('\n');
    expect(ignore).toContain('/private.local.json');
    expect(ignore).toContain('/sources.local.json');
  });
});
