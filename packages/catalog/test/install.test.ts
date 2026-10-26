import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
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
} from '../src/install.ts';
import { buildCatalog, type Skill } from '../src/index.ts';
import { scanTree } from '../src/tree.ts';

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
  execFileSync('tar', ['-czf', join(dir, 'a.tgz'), '-C', dir, top]);
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
    await installSkill(root, skill(SHA1, hashOf(V1)), fetch);
    await expect(installSkill(root, skill(SHA2, hashOf(V2)), fetch)).rejects.toThrow(/--replace/);

    writeFileSync(join(root, 'external/skills/demo/SKILL.md'), 'local edit');
    await expect(
      installSkill(root, skill(SHA2, hashOf(V2)), fetch, { replace: true }),
    ).rejects.toThrow(/modified locally/);
    expect(installStatus(root)[0]!.state).toBe('modified');

    const other = tmp('es-root-');
    mkdirSync(join(other, 'external/skills/demo'), { recursive: true });
    await expect(installSkill(other, skill(SHA1, hashOf(V1)), fetch)).rejects.toThrow(
      /not in installed.json/,
    );
  });

  it('leaves nothing behind when the download fails', async () => {
    const root = tmp('es-root-');
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
    await installSkill(root, skill(SHA1, hashOf(V1)), fetch, { now });
    const r = await installSkill(root, skill(SHA2, hashOf(V2)), fetch, { replace: true, now });
    expect(r.status).toBe('replaced');
    expect(existsSync(join(root, 'external/skills/demo/ref.md'))).toBe(true);

    expect(rollbackSkill(root, 'demo', { now })).toMatchObject({
      revision: SHA1,
      contentHash: hashOf(V1),
    });
    expect(readFileSync(join(root, 'external/skills/demo/SKILL.md'), 'utf8')).toBe('# demo v1\n');
    expect(installStatus(root)).toEqual([{ id: 'demo', revision: SHA1, state: 'installed' }]);

    expect(rollbackSkill(root, 'demo', { now }).revision).toBe(SHA2);
    expect(installStatus(root)).toEqual([{ id: 'demo', revision: SHA2, state: 'installed' }]);
  });

  it('uninstall keeps a backup and rollback without backups fails cleanly', async () => {
    const root = tmp('es-root-');
    const now = clock();
    expect(() => rollbackSkill(root, 'demo')).toThrow(/no backup/);
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
