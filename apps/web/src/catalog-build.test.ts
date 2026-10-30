import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, catalogToJson } from '@ecosystem-skills/catalog';
import { catalogPlugin } from '../catalog-plugin.ts';

/*
 * Regression tests for the Vercel 404 on /catalog.json: the site was built from apps/web, whose build did not
 * generate the catalog (only the repo-root script did). The catalog must now be part of every `vite build`.
 */
const repo = resolve(__dirname, '../../..');
const web = join(repo, 'apps/web');
const REGISTRY = [
  'skills',
  'consumers',
  'integrations',
  'evidence',
  'sources',
  'releases',
  'evaluations',
  'updates',
] as const;
const readRegistry = (root: string) =>
  Object.fromEntries(
    REGISTRY.map((n) => [n, JSON.parse(readFileSync(join(root, 'registry', `${n}.json`), 'utf8'))]),
  ) as Record<(typeof REGISTRY)[number], unknown[]>;
/** What catalog.json must contain for a registry, computed independently of the build under test. */
const expectedCatalog = (root: string) => {
  const r = buildCatalog(readRegistry(root));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.catalog;
};
const tmp = (p: string) => realpathSync(mkdtempSync(join(tmpdir(), p)));

/** A registry copy; `break` makes it invalid (a skill without required fields). */
function registryCopy(opts: { break?: boolean } = {}) {
  const root = tmp('es-catalog-');
  cpSync(join(repo, 'registry'), join(root, 'registry'), { recursive: true });
  if (opts.break) writeFileSync(join(root, 'registry/skills.json'), '[{"id":"broken"}]\n');
  return root;
}

describe('catalog plugin', () => {
  const run = (registryRoot: string) => {
    const emitted: { fileName: string; source: string }[] = [];
    const plugin = catalogPlugin({ registryRoot });
    const buildStart = plugin.buildStart as (this: object) => void;
    buildStart.call({
      emitFile: (f: { fileName: string; source: string }) => emitted.push(f),
    });
    return emitted;
  };

  it('emits catalog.json from the registry at build start, with counts taken from the registry', () => {
    const emitted = run(repo);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.fileName).toBe('catalog.json');
    const catalog = JSON.parse(emitted[0]!.source) as Record<string, unknown[]>;
    const reg = readRegistry(repo);
    expect(catalog.skills).toHaveLength(reg.skills.length);
    expect(catalog.consumers).toHaveLength(reg.consumers.length);
    expect(catalog.integrations).toHaveLength(reg.integrations.length);
    expect(catalog.evidence).toHaveLength(reg.evidence.length);
    expect(catalog.sources).toHaveLength(reg.sources.length);
    expect(emitted[0]!.source).toBe(catalogToJson(expectedCatalog(repo)));
  });

  it('fails the build with a clear message when the registry is invalid, emitting nothing', () => {
    const emitted: unknown[] = [];
    const plugin = catalogPlugin({ registryRoot: registryCopy({ break: true }) });
    const buildStart = plugin.buildStart as (this: object) => void;
    expect(() => buildStart.call({ emitFile: (f: unknown) => emitted.push(f) })).toThrow(
      /Catalog generation failed: registry is invalid/,
    );
    expect(emitted).toEqual([]);
  });

  it('fails when the registry is missing altogether', () => {
    expect(() => run(tmp('es-empty-'))).toThrow(/Catalog generation failed/);
  });
});

/** A disposable copy of apps/web next to a registry copy, with no public/ folder and no pre-generated files. */
function siteCopy(opts: { break?: boolean } = {}) {
  const root = registryCopy(opts);
  const dir = join(root, 'apps/web');
  mkdirSync(dir, { recursive: true });
  // package.json makes the copy an ES module, as in the real package.
  for (const f of [
    'vite.config.ts',
    'catalog-plugin.ts',
    'index.html',
    'tsconfig.json',
    'package.json',
  ])
    cpSync(join(web, f), join(dir, f));
  cpSync(join(repo, 'tsconfig.base.json'), join(root, 'tsconfig.base.json'));
  cpSync(join(web, 'src'), join(dir, 'src'), { recursive: true });
  symlinkSync(join(web, 'node_modules'), join(dir, 'node_modules'));
  expect(existsSync(join(dir, 'public'))).toBe(false);
  return { root, dir };
}
const vite = (dir: string) =>
  spawnSync(process.execPath, [join(web, 'node_modules/vite/bin/vite.js'), 'build'], {
    cwd: dir,
    encoding: 'utf8',
  });

describe('production build (real vite build, nothing pre-generated)', () => {
  it('produces dist/index.html and a valid dist/catalog.json without any separate catalog step', () => {
    const { root, dir } = siteCopy();
    const r = vite(dir);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(existsSync(join(dir, 'dist/index.html'))).toBe(true);
    const file = join(dir, 'dist/catalog.json');
    expect(existsSync(file)).toBe(true);

    const text = readFileSync(file, 'utf8');
    const catalog = JSON.parse(text) as Record<string, unknown>; // valid JSON
    expect(text).toBe(catalogToJson(expectedCatalog(root))); // exactly the generated catalog
    const reg = readRegistry(root);
    for (const k of [
      'skills',
      'consumers',
      'integrations',
      'evidence',
      'sources',
      'releases',
    ] as const)
      expect(catalog[k], k).toHaveLength(reg[k].length);
    // The public catalog must carry no local paths or credential-like strings.
    expect(text).not.toMatch(
      /\/Users\/|\/private\/|\/home\/|C:\\|file:\/\/|consumers\.local|ghp_|sk-[A-Za-z0-9]{20}/,
    );
    // Nothing was written back into the source tree.
    expect(existsSync(join(dir, 'public'))).toBe(false);
  }, 60_000);

  it('fails the build, and publishes nothing, when catalog generation fails', () => {
    const { dir } = siteCopy({ break: true });
    const r = vite(dir);
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/Catalog generation failed: registry is invalid/);
    expect(existsSync(join(dir, 'dist/catalog.json'))).toBe(false);
    expect(existsSync(join(dir, 'dist/index.html'))).toBe(false); // no half-built site to deploy
  }, 60_000);

  it('the app fetches the catalog from the same place the build writes it', () => {
    const lib = readFileSync(join(web, 'src/lib.ts'), 'utf8');
    expect(lib).toMatch(/fetch\(`\$\{import\.meta\.env\.BASE_URL\}catalog\.json`\)/);
  });
});

describe('deployment configuration', () => {
  const pkg = (p: string) =>
    JSON.parse(readFileSync(join(repo, p), 'utf8')) as { scripts: Record<string, string> };

  it('the web package build runs vite build, which is where the catalog is generated', () => {
    expect(pkg('apps/web/package.json').scripts.build).toMatch(/\bvite build\b/);
    expect(readFileSync(join(web, 'vite.config.ts'), 'utf8')).toMatch(/catalogPlugin\(/);
  });

  it('vercel.json lives in the Vercel root directory (apps/web) with paths relative to it', () => {
    expect(existsSync(join(repo, 'vercel.json'))).toBe(false); // a second, conflicting config
    const v = JSON.parse(readFileSync(join(web, 'vercel.json'), 'utf8')) as Record<string, string>;
    expect(v.framework).toBe('vite');
    expect(v.outputDirectory).toBe('dist');
    expect(v.buildCommand).toBe('pnpm run build');
    expect(v.buildCommand).not.toMatch(/catalog:build|apps\/web/); // no manual or root-relative steps
  });

  it('generated catalog files are excluded from Git and not tracked', () => {
    const ignore = readFileSync(join(repo, '.gitignore'), 'utf8').split('\n');
    expect(ignore).toContain('apps/web/public/catalog.json');
    expect(ignore).toContain('dist/');
    const git = spawnSync('git', ['ls-files', '--', '*catalog.json'], {
      cwd: repo,
      encoding: 'utf8',
    });
    if (git.status === 0) expect(git.stdout.trim()).toBe('');
    for (const p of ['apps/web/public/catalog.json', 'apps/web/dist/catalog.json']) {
      const c = spawnSync('git', ['check-ignore', '-q', p], { cwd: repo });
      if (c.status !== 128) expect(c.status, `${p} must be ignored`).toBe(0); // 128 = not a git checkout
    }
  });
});
