import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fetchSkill,
  type Fetch,
  installSkill,
  installStatus,
  readLock,
  rollbackSkill,
  uninstallSkill,
  type Fault,
} from '../src/install.ts';
import { buildCatalog, type Skill } from '../src/index.ts';
import { scanTree } from '../src/tree.ts';
import { NO_APPLEDOUBLE } from './fixtures.ts';

const SHA1 = '1'.repeat(40);
const SHA2 = '2'.repeat(40);
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));

/** Build a codeload-style tarball: <repo>-<sha>/skills/demo/... */
function tarball(
  sha: string,
  files: Record<string, string>,
  { top = `repo-${sha}`, link = false } = {},
): Buffer {
  const dir = tmp('es-tar-');
  const skill = join(dir, top, 'skills/demo');
  mkdirSync(skill, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(skill, name), body);
  if (link) symlinkSync('/etc/hosts', join(skill, 'escape'));
  execFileSync('tar', ['-czf', join(dir, 'a.tgz'), '-C', dir, top], NO_APPLEDOUBLE);
  return readFileSync(join(dir, 'a.tgz'));
}

/** Content hash of what the skill folder will look like once extracted. */
function hashOf(files: Record<string, string>): string {
  const d = tmp('es-h-');
  for (const [name, body] of Object.entries(files)) writeFileSync(join(d, name), body);
  return scanTree(d).hash;
}

const serve =
  (archives: Record<string, Buffer>): Fetch =>
  async (url) => {
    const sha = url.split('/').at(-1)!;
    const body = archives[sha];
    return {
      ok: !!body,
      status: body ? 200 : 404,
      arrayBuffer: async () => new Uint8Array(body ?? Buffer.alloc(0)).buffer,
    };
  };

const rawSkill = (
  revision: string,
  contentHash: string,
  status = 'approved',
  extra: Record<string, unknown> = {},
) => ({
  id: 'demo',
  name: 'Demo',
  description: 'd',
  category: 'general',
  origin: 'external',
  source: {
    type: 'external',
    upstream: { url: 'https://github.com/org/repo' },
    path: 'skills/demo',
    revision,
  },
  author: 'a',
  license: 'MIT',
  review: {
    status,
    reviewedAt: '2026-10-26',
    reviewer: 'r',
    ...(status === 'approved' ? { approvedBy: 'owner' } : {}),
    revision,
    contentHash,
  },
  ...extra,
});

/** Write the registry the legacy installer decides from (rollback always reads it, install when it exists). */
function pin(
  root: string,
  revision: string,
  contentHash: string,
  status = 'approved',
  extra: Record<string, unknown> = {},
) {
  mkdirSync(join(root, 'registry'), { recursive: true });
  writeFileSync(
    join(root, 'registry/skills.json'),
    JSON.stringify([rawSkill(revision, contentHash, status, extra)]),
  );
  writeFileSync(join(root, 'registry/consumers.json'), '[]');
  writeFileSync(join(root, 'registry/integrations.json'), '[]');
}

function skill(revision: string, contentHash: string, status = 'approved'): Skill {
  const r = buildCatalog({
    skills: [
      {
        id: 'demo',
        name: 'Demo',
        description: 'd',
        category: 'general',
        origin: 'external',
        source: {
          type: 'external',
          upstream: { url: 'https://github.com/org/repo' },
          path: 'skills/demo',
          revision,
        },
        author: 'a',
        license: 'MIT',
        review: {
          status,
          reviewedAt: '2026-10-26',
          reviewer: 'r',
          ...(status === 'approved' ? { approvedBy: 'owner' } : {}),
          revision,
          contentHash,
        },
      },
    ],
    consumers: [],
    integrations: [],
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.catalog.skills[0]!;
}

const V1 = { 'SKILL.md': '# demo v1\n' };
const V2 = { 'SKILL.md': '# demo v2\n', 'ref.md': 'more\n' };
const clock = () => {
  let t = Date.UTC(2026, 9, 26);
  return () => new Date((t += 1000));
};
const leftovers = (root: string) =>
  existsSync(join(root, 'external/.staging')) ? readdirSync(join(root, 'external/.staging')) : [];

describe('installSkill', () => {
  it('refuses skills that are not approved for the pinned revision', async () => {
    const root = tmp('es-root-');
    const fetch = serve({ [SHA1]: tarball(SHA1, V1) });
    await expect(installSkill(root, skill(SHA1, hashOf(V1), 'reviewed'), fetch)).rejects.toThrow(
      /not approved/,
    );
    const s = skill(SHA1, hashOf(V1));
    s.review.revision = SHA2;
    await expect(installSkill(root, s, fetch)).rejects.toThrow(
      /does not cover the pinned revision/,
    );
    expect(existsSync(join(root, 'external/skills'))).toBe(false);
  });

  it('installs into the managed directory and records the lock; reinstall is a no-op', async () => {
    const root = tmp('es-root-');
    pin(root, SHA1, hashOf(V1));
    const fetch = serve({ [SHA1]: tarball(SHA1, V1) });
    expect(await installSkill(root, skill(SHA1, hashOf(V1)), fetch)).toEqual({
      status: 'installed',
      backup: undefined,
    });
    expect(readFileSync(join(root, 'external/skills/demo/SKILL.md'), 'utf8')).toBe('# demo v1\n');
    expect(readLock({ base: join(root, 'external') }).demo).toMatchObject({
      revision: SHA1,
      contentHash: hashOf(V1),
    });
    expect((await installSkill(root, skill(SHA1, hashOf(V1)), fetch)).status).toBe('unchanged');
    expect(installStatus(root)).toEqual([{ id: 'demo', revision: SHA1, state: 'installed' }]);
    expect(leftovers(root)).toEqual([]);
  });

  it('never overwrites silently (installation conflicts)', async () => {
    const root = tmp('es-root-');
    const fetch = serve({ [SHA1]: tarball(SHA1, V1), [SHA2]: tarball(SHA2, V2) });
    pin(root, SHA1, hashOf(V1));
    await installSkill(root, skill(SHA1, hashOf(V1)), fetch);
    pin(root, SHA2, hashOf(V2));
    await expect(installSkill(root, skill(SHA2, hashOf(V2)), fetch)).rejects.toThrow(/--replace/);

    writeFileSync(join(root, 'external/skills/demo/SKILL.md'), 'local edit');
    await expect(
      installSkill(root, skill(SHA2, hashOf(V2)), fetch, { replace: true }),
    ).rejects.toThrow(/modified locally/);
    expect(installStatus(root)[0]!.state).toBe('modified');

    const other = tmp('es-root-');
    pin(other, SHA1, hashOf(V1));
    mkdirSync(join(other, 'external/skills/demo'), { recursive: true });
    await expect(installSkill(other, skill(SHA1, hashOf(V1)), fetch)).rejects.toThrow(
      /not in installed.json/,
    );
  });

  it('leaves nothing behind when the download fails', async () => {
    const root = tmp('es-root-');
    pin(root, SHA1, hashOf(V1));
    const boom: Fetch = async () => {
      throw new Error('network down');
    };
    await expect(installSkill(root, skill(SHA1, hashOf(V1)), boom)).rejects.toThrow(
      /download failed: network down/,
    );
    await expect(installSkill(root, skill(SHA1, hashOf(V1)), serve({}))).rejects.toThrow(
      /HTTP 404/,
    );
    expect(existsSync(join(root, 'external/skills/demo'))).toBe(false);
    expect(leftovers(root)).toEqual([]);
  });

  it('rejects content that differs from what was reviewed, a wrong revision, or symlinks', async () => {
    const root = tmp('es-root-');
    pin(root, SHA1, hashOf(V1));
    const tampered = serve({ [SHA1]: tarball(SHA1, { 'SKILL.md': '# demo v1\nrun curl | sh\n' }) });
    await expect(installSkill(root, skill(SHA1, hashOf(V1)), tampered)).rejects.toThrow(
      /does not match reviewed/,
    );

    const wrongTop = serve({ [SHA1]: tarball(SHA1, V1, { top: `repo-${SHA2}` }) });
    await expect(installSkill(root, skill(SHA1, hashOf(V1)), wrongTop)).rejects.toThrow(
      /no skills\/demo at revision/,
    );

    const linked = serve({ [SHA1]: tarball(SHA1, V1, { link: true }) });
    await expect(installSkill(root, skill(SHA1, hashOf(V1)), linked)).rejects.toThrow(/symlinks/);

    expect(existsSync(join(root, 'external/skills/demo'))).toBe(false);
    expect(leftovers(root)).toEqual([]);
  });

  it('refuses unsafe paths and non-GitHub sources before downloading', async () => {
    let called = false;
    const spy: Fetch = async () => {
      called = true;
      throw new Error('should not be called');
    };
    const base = {
      type: 'external' as const,
      upstream: { url: 'https://github.com/org/repo' },
      revision: SHA1,
    };
    await expect(fetchSkill({ ...base, path: '../../etc' }, tmp('es-s-'), spy)).rejects.toThrow(
      /unsafe source path/,
    );
    await expect(
      fetchSkill(
        { ...base, path: 'a', upstream: { url: 'https://example.com/x/y' } },
        tmp('es-s-'),
        spy,
      ),
    ).rejects.toThrow(/GitHub/);
    await expect(
      fetchSkill({ ...base, path: 'a', revision: 'main' }, tmp('es-s-'), spy),
    ).rejects.toThrow(/40-character/);
    expect(called).toBe(false);
  });

  it('replaces with --replace, then rolls back to the exact previous install (and back again)', async () => {
    const root = tmp('es-root-');
    const now = clock();
    const fetch = serve({ [SHA1]: tarball(SHA1, V1), [SHA2]: tarball(SHA2, V2) });
    pin(root, SHA1, hashOf(V1));
    await installSkill(root, skill(SHA1, hashOf(V1)), fetch, { now });
    pin(root, SHA2, hashOf(V2));
    const r = await installSkill(root, skill(SHA2, hashOf(V2)), fetch, { replace: true, now });
    expect(r.status).toBe('replaced');
    expect(existsSync(join(root, 'external/skills/demo/ref.md'))).toBe(true);

    // the registry approves SHA2 only: putting SHA1 back is refused, and nothing changes (audit F1)
    expect(() => rollbackSkill(root, 'demo', { now })).toThrow(
      /only content the registry currently approves can be put in place[\s\S]*Nothing was changed/,
    );
    expect(installStatus(root)).toEqual([{ id: 'demo', revision: SHA2, state: 'installed' }]);
    // the owner reverts the pin (with its approval): the rollback is allowed
    pin(root, SHA1, hashOf(V1));
    expect(rollbackSkill(root, 'demo', { now })).toMatchObject({
      revision: SHA1,
      contentHash: hashOf(V1),
    });
    expect(readFileSync(join(root, 'external/skills/demo/SKILL.md'), 'utf8')).toBe('# demo v1\n');
    expect(installStatus(root)).toEqual([{ id: 'demo', revision: SHA1, state: 'installed' }]);

    pin(root, SHA2, hashOf(V2));
    expect(rollbackSkill(root, 'demo', { now }).revision).toBe(SHA2);
    expect(installStatus(root)).toEqual([{ id: 'demo', revision: SHA2, state: 'installed' }]);
  });

  it('uninstall keeps a backup and rollback without backups fails cleanly', async () => {
    const root = tmp('es-root-');
    const now = clock();
    expect(() => rollbackSkill(root, 'demo')).toThrow(/no backup/);
    pin(root, SHA1, hashOf(V1));
    await installSkill(root, skill(SHA1, hashOf(V1)), serve({ [SHA1]: tarball(SHA1, V1) }), {
      now,
    });
    uninstallSkill(root, 'demo', { now });
    expect(existsSync(join(root, 'external/skills/demo'))).toBe(false);
    expect(readLock({ base: join(root, 'external') })).toEqual({});
    expect(rollbackSkill(root, 'demo', { now }).revision).toBe(SHA1); // undo the uninstall
    expect(() => uninstallSkill(root, 'nope')).toThrow(/not installed/);
  });
});

/* ------------------------------------------------------------------ audit 1–3: transactions, paths, registry */

/** Every name and byte under a folder (links shown by target), to prove a failed change left nothing different. */
const tree = (dir: string): string =>
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
    : '(none)';
const counting = (n: number, code = 'EIO') => {
  let calls = 0;
  const seen: string[] = [];
  const fault: Fault = (op, path) => {
    seen.push(`${op} ${path.split('/').slice(-2).join('/')}`);
    if (calls++ === n) throw Object.assign(new Error(`injected ${code} at ${op}`), { code });
  };
  return { fault, seen };
};

/** v1 installed and v2 pinned: a replace has every kind of step (mkdir, two renames, metadata, lock). */
async function replaceable() {
  const root = tmp('es-tx-');
  const now = clock();
  const fetch = serve({ [SHA1]: tarball(SHA1, V1), [SHA2]: tarball(SHA2, V2) });
  pin(root, SHA1, hashOf(V1));
  await installSkill(root, skill(SHA1, hashOf(V1)), fetch, { now });
  pin(root, SHA2, hashOf(V2));
  return { root, now, fetch };
}

describe('legacy engine: every mutation is journaled and a failure anywhere is undone and verified', () => {
  it('install --replace: a failure at each single operation leaves external/ byte-identical', async () => {
    let completed = false;
    for (let n = 0; n < 30 && !completed; n++) {
      const { root, now, fetch } = await replaceable();
      const before = tree(join(root, 'external'));
      const { fault, seen } = counting(n);
      try {
        await installSkill(root, skill(SHA2, hashOf(V2)), fetch, { replace: true, now, fault });
        completed = true;
        expect(n).toBeGreaterThanOrEqual(6); // mkdir, rename, metadata (write + partial), rename, lock (write + partial)
      } catch (e) {
        expect((e as Error).message, seen.at(-1)).toMatch(/put back as it was \(verified\)/);
        expect(tree(join(root, 'external')), seen.at(-1)).toBe(before);
        expect(leftovers(root)).toEqual([]);
      }
    }
    expect(completed).toBe(true);
  });

  it('a partial lock write followed by ENOSPC never changes the lock bytes', async () => {
    const { root, now, fetch } = await replaceable();
    const lockBefore = readFileSync(join(root, 'external/installed.json'));
    const fault: Fault = (op, path) => {
      if (op === 'write-partial' && path.endsWith('installed.json'))
        throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    };
    await expect(
      installSkill(root, skill(SHA2, hashOf(V2)), fetch, { replace: true, now, fault }),
    ).rejects.toThrow(/ENOSPC[\s\S]*put back as it was \(verified\)/);
    expect(readFileSync(join(root, 'external/installed.json')).equals(lockBefore)).toBe(true);
    expect(readdirSync(join(root, 'external')).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect(readFileSync(join(root, 'external/skills/demo/SKILL.md'), 'utf8')).toBe('# demo v1\n');
  });

  it('uninstall and rollback: a failure at each single operation is undone and verified', async () => {
    for (const run of ['uninstall', 'rollback'] as const) {
      let completed = false;
      for (let n = 0; n < 30 && !completed; n++) {
        const { root, now, fetch } = await replaceable();
        await installSkill(root, skill(SHA2, hashOf(V2)), fetch, { replace: true, now });
        if (run === 'rollback') pin(root, SHA1, hashOf(V1));
        const before = tree(join(root, 'external'));
        const { fault, seen } = counting(n, 'ENOSPC');
        try {
          if (run === 'uninstall') uninstallSkill(root, 'demo', { now, fault });
          else rollbackSkill(root, 'demo', { now, fault });
          completed = true;
        } catch (e) {
          expect((e as Error).message, `${run} ${seen.at(-1)}`).toMatch(/\(verified\)/);
          expect(tree(join(root, 'external')), `${run} ${seen.at(-1)}`).toBe(before);
        }
      }
      expect(completed, run).toBe(true);
    }
  });

  it('EISDIR: a lock or a metadata path that is a folder is refused before anything moves', async () => {
    const { root, now, fetch } = await replaceable();
    rmSync(join(root, 'external/installed.json'));
    mkdirSync(join(root, 'external/installed.json'));
    let before = tree(join(root, 'external'));
    await expect(
      installSkill(root, skill(SHA2, hashOf(V2)), fetch, { replace: true, now }),
    ).rejects.toThrow(/installed.json is a dir[\s\S]*nothing was changed/);
    expect(tree(join(root, 'external'))).toBe(before);
    // the place a rollback would move the live install to already has a folder named like its metadata
    const r = await replaceable();
    await installSkill(r.root, skill(SHA2, hashOf(V2)), r.fetch, { replace: true, now: r.now });
    pin(r.root, SHA1, hashOf(V1));
    const fixed = () => new Date(Date.UTC(2027, 0, 1));
    mkdirSync(join(r.root, 'external/.backups/demo/2027-01-01T00-00-00-000Z-rolledback.json'));
    before = tree(join(r.root, 'external'));
    expect(() => rollbackSkill(r.root, 'demo', { now: fixed })).toThrow(
      /rolledback.json is a dir[\s\S]*nothing was changed/,
    );
    expect(tree(join(r.root, 'external'))).toBe(before);
    expect(readFileSync(join(r.root, 'external/skills/demo/SKILL.md'), 'utf8')).toBe('# demo v2\n');
  });
});

describe('legacy engine: managed paths are never followed through symlinks', () => {
  /** Move a managed folder outside the repository and leave a symlink in its place. */
  const alias = (root: string, rel: string) => {
    const outside = join(tmp('es-outside-'), 'target');
    renameSync(join(root, rel), outside);
    symlinkSync(outside, join(root, rel));
    return outside;
  };
  const prepared = async () => {
    const r = await replaceable();
    await installSkill(r.root, skill(SHA2, hashOf(V2)), r.fetch, { replace: true, now: r.now });
    pin(r.root, SHA1, hashOf(V1));
    return r;
  };

  it('rollback refuses a symlinked .backups, .backups/<id>, skills/ or external/, and writes nothing outside', async () => {
    for (const rel of [
      'external/.backups',
      'external/.backups/demo',
      'external/skills',
      'external',
    ]) {
      const { root, now } = await prepared();
      const outside = alias(root, rel);
      const outsideBefore = tree(outside);
      expect(() => rollbackSkill(root, 'demo', { now }), rel).toThrow(
        /refusing to follow it[\s\S]*nothing was changed/,
      );
      expect(tree(outside), rel).toBe(outsideBefore);
    }
  });

  it('install and uninstall refuse symlinked staging, skills and backup folders before any download or move', async () => {
    for (const rel of ['external/.staging', 'external/skills', 'external/.backups/demo']) {
      const { root, now } = await prepared();
      mkdirSync(join(root, 'external/.staging'), { recursive: true });
      const outside = alias(root, rel);
      const outsideBefore = tree(outside);
      let fetched = false;
      const spy: Fetch = async () => {
        fetched = true;
        throw new Error('must not download');
      };
      pin(root, SHA2, hashOf(V2));
      await expect(
        installSkill(root, skill(SHA2, hashOf(V2)), spy, { replace: true, now }),
        rel,
      ).rejects.toThrow(/refusing to follow it/);
      expect(fetched, rel).toBe(false);
      if (rel !== 'external/.staging')
        expect(() => uninstallSkill(root, 'demo', { now }), rel).toThrow(/refusing to follow it/);
      expect(tree(outside), rel).toBe(outsideBefore);
    }
  });
});

describe('legacy engine: a readable registry is required and decides immediately before the change', () => {
  it('without a registry nothing is downloaded or installed', async () => {
    const root = tmp('es-root-');
    let fetched = false;
    await expect(
      installSkill(root, skill(SHA1, hashOf(V1)), async () => {
        fetched = true;
        throw new Error('must not download');
      }),
    ).rejects.toThrow(/cannot read the registry/);
    expect(fetched).toBe(false);
    expect(existsSync(join(root, 'external/skills'))).toBe(false);
  });

  it('the registry disappearing, or the policy or approval changing, during the download is refused', async () => {
    const changes: [string, (root: string) => void, RegExp][] = [
      [
        'registry removed',
        (root) => rmSync(join(root, 'registry'), { recursive: true }),
        /cannot read the registry/,
      ],
      [
        'not distributable',
        (root) =>
          pin(root, SHA1, hashOf(V1), 'approved', {
            distribution: { policy: 'not-distributable' },
          }),
        /not distributable/,
      ],
      [
        'restricted',
        (root) =>
          pin(root, SHA1, hashOf(V1), 'approved', {
            distribution: { policy: 'restricted', access: 'authorized-consumers' },
          }),
        /restricted/,
      ],
      ['approval revoked', (root) => pin(root, SHA1, hashOf(V1), 'reviewed'), /not approved/],
    ];
    for (const [what, change, re] of changes) {
      const root = tmp('es-root-');
      pin(root, SHA1, hashOf(V1));
      const archive = serve({ [SHA1]: tarball(SHA1, V1) });
      const during: Fetch = async (url) => {
        change(root);
        return archive(url);
      };
      await expect(installSkill(root, skill(SHA1, hashOf(V1)), during), what).rejects.toThrow(re);
      expect(existsSync(join(root, 'external/skills/demo')), what).toBe(false);
      expect(existsSync(join(root, 'external/installed.json')), what).toBe(false);
      expect(leftovers(root), what).toEqual([]);
    }
  });
});
