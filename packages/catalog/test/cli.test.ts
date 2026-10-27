import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assignSkill } from '../src/consumers.ts';
import { formatJson } from '../src/fsguard.ts';
import { makeRepo, tmp } from './fixtures.ts';

/*
 * End-to-end: the real cli.ts, copied into a disposable fixture repo (the CLI finds its registry relative to
 * its own file), so ordering bugs between validation and writing are caught where they happen.
 */
const pkg = resolve(__dirname, '..');
const TSX = join(pkg, 'node_modules/tsx/dist/cli.mjs');

function cliRepo() {
  const r = makeRepo();
  cpSync(join(pkg, 'src'), join(r.root, 'packages/catalog/src'), { recursive: true });
  // package.json makes the copy an ES module (cli.ts uses top-level await), as in the real package.
  cpSync(join(pkg, 'package.json'), join(r.root, 'packages/catalog/package.json'));
  symlinkSync(join(pkg, 'node_modules'), join(r.root, 'packages/catalog/node_modules'));
  return r;
}
const run = (root: string, ...args: string[]) =>
  spawnSync(process.execPath, [TSX, join(root, 'packages/catalog/src/cli.ts'), ...args], {
    cwd: join(root, 'packages/catalog'),
    env: { ...process.env, INIT_CWD: root },
    encoding: 'utf8',
  });
const read = (root: string, rel: string) => readFileSync(join(root, rel), 'utf8');
const T = 30_000;

describe('cli: malformed invocations never write', () => {
  it(
    'assign/unassign with a bare "dry-run" fail before the registry is touched; valid forms still work',
    () => {
      const { root } = cliRepo();
      const before = read(root, 'registry/consumers.json');
      const bad = run(root, 'assign', 'proj', 'ext', 'dry-run');
      expect(bad.status).toBe(2);
      expect(bad.stderr).toMatch(/unexpected extra argument "dry-run".*did you mean --dry-run/);
      expect(read(root, 'registry/consumers.json')).toBe(before);

      expect(run(root, 'assign', 'proj', 'ext', '--dry-run').status).toBe(0);
      expect(read(root, 'registry/consumers.json')).toBe(before);
      expect(run(root, 'assign', 'proj', 'ext').status).toBe(0);
      const assigned = read(root, 'registry/consumers.json');
      expect(assigned).not.toBe(before);

      const badUn = run(root, 'unassign', 'proj', 'ext', 'dryrun');
      expect(badUn.status).toBe(2);
      expect(read(root, 'registry/consumers.json')).toBe(assigned);
    },
    T,
  );

  it(
    'install-side commands reject extra arguments without touching installs',
    () => {
      const { root } = cliRepo();
      const lock = read(root, 'external/installed.json');
      for (const cmd of ['uninstall', 'rollback', 'install', 'review']) {
        const r = run(root, cmd, 'ext', 'now');
        expect(r.status, cmd).toBe(2);
        expect(r.stderr, cmd).toMatch(/unexpected extra argument "now"/);
      }
      expect(read(root, 'external/installed.json')).toBe(lock);
      expect(existsSync(join(root, 'external/skills/ext/SKILL.md'))).toBe(true);
    },
    T,
  );

  it(
    'an explicitly empty --project is an error, not a fallback to consumers.local.json',
    () => {
      const { root, project } = cliRepo();
      assignSkill(root, 'proj', 'ext');
      writeFileSync(join(root, 'consumers.local.json'), JSON.stringify({ proj: project }));
      const r = run(root, 'sync', 'proj', '--project', '');
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--project was given an empty value/);
      expect(existsSync(join(project, '.claude'))).toBe(false);
    },
    T,
  );
});

describe('cli: unassign validates before writing', () => {
  it(
    'a bad --project or an unsafe project folder leaves the registry byte-for-byte unchanged',
    () => {
      const { root, project } = cliRepo();
      assignSkill(root, 'proj', 'ext');
      const before = read(root, 'registry/consumers.json');

      const missing = run(root, 'unassign', 'proj', 'ext', '--project', 'no-such-dir');
      expect(missing.status).toBe(1);
      expect(missing.stderr).toMatch(/project directory does not exist/);
      expect(missing.stdout).not.toMatch(/removed/);
      expect(read(root, 'registry/consumers.json')).toBe(before);

      const elsewhere = tmp('es-elsewhere-');
      symlinkSync(elsewhere, join(project, '.claude')); // writing through it would escape the project
      const unsafe = run(root, 'unassign', 'proj', 'ext', '--project', project);
      expect(unsafe.status).toBe(1);
      expect(unsafe.stderr).toMatch(/symlink/);
      expect(read(root, 'registry/consumers.json')).toBe(before);
    },
    T,
  );

  it(
    'a valid unassign still writes and reports the leftover link as drift',
    () => {
      const { root, project } = cliRepo();
      assignSkill(root, 'proj', 'ext');
      expect(run(root, 'sync', 'proj', '--project', project).status).toBe(0);
      const before = read(root, 'registry/consumers.json');
      const r = run(root, 'unassign', 'proj', 'ext', '--project', project);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/removed/);
      expect(r.stdout).toMatch(/DRIFT \.claude\/skills\/ext is still active/);
      expect(read(root, 'registry/consumers.json')).not.toBe(before);
      expect(existsSync(join(project, '.claude/skills/ext'))).toBe(true); // links are left for sync --prune
    },
    T,
  );
});

describe('cli: --project must agree with consumers.local.json', () => {
  it(
    'refuses to sync or prune a folder configured for another consumer, or a folder other than the configured one',
    () => {
      const { root, project } = cliRepo();
      const consumers = JSON.parse(read(root, 'registry/consumers.json')) as object[];
      writeFileSync(
        join(root, 'registry/consumers.json'),
        formatJson([...consumers, { id: 'proj2', name: 'P2', kind: 'project', agents: ['codex'] }]),
      );
      assignSkill(root, 'proj', 'ext');
      writeFileSync(join(root, 'consumers.local.json'), JSON.stringify({ proj: project }));
      expect(run(root, 'sync', 'proj').status).toBe(0); // configured location: links created
      const registryBefore = [read(root, 'registry/consumers.json')];

      // The ES13.1 finding: another consumer id pointed at this folder would see these links as stale.
      const prune = run(root, 'sync', 'proj2', '--project', project, '--prune');
      expect(prune.status).toBe(1);
      expect(prune.stderr).toMatch(/is the folder configured for consumer "proj".*not for "proj2"/);
      expect(existsSync(join(project, '.claude/skills/ext'))).toBe(true);
      expect(existsSync(join(project, '.agents/skills/ext'))).toBe(true);

      const other = tmp('es-other-');
      mkdirSync(join(other, '.git'));
      for (const extra of [[], ['--dry-run']]) {
        const r = run(root, 'sync', 'proj', '--project', other, ...extra);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/does not match the location configured for "proj"/);
      }
      expect(existsSync(join(other, '.claude'))).toBe(false);
      expect(run(root, 'verify', 'proj2', '--project', project).status).toBe(1); // same rule everywhere

      // Legitimate uses are unchanged.
      expect(run(root, 'sync', 'proj', '--project', project, '--dry-run').status).toBe(0);
      expect(run(root, 'verify', 'proj').status).toBe(0);
      expect([read(root, 'registry/consumers.json')]).toEqual(registryBefore);
    },
    T,
  );
});
