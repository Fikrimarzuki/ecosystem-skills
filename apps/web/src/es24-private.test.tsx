import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildCatalog, type Catalog } from '@ecosystem-skills/catalog';
import { Page } from './App.tsx';
import { I18nProvider } from './i18n.tsx';

/*
 * ES24: private skills never reach public artifacts. The build is run for real with a private root configured (both by
 * environment variable and by private.local.json), and every output file and the build log are searched for markers
 * that exist only in the synthetic private data.
 */
const repo = resolve(__dirname, '../../..');
const web = join(repo, 'apps/web');
const tmp = (p: string) => realpathSync(mkdtempSync(join(tmpdir(), p)));
const MARKERS = [
  'PRIVATE-MARKER-4d2a',
  'secret-studio-helper',
  'Confidential client workflow',
  // ES25: authorization records for the public restricted skills stay private too
  'AUTH-MARKER-77c3',
];

function privateRoot() {
  const dir = tmp('es24-web-private-');
  chmodSync(dir, 0o700);
  writeFileSync(join(dir, 'ecosystem-skills-private.json'), '{ "schemaVersion": 1 }\n');
  mkdirSync(join(dir, 'registry'));
  writeFileSync(
    join(dir, 'registry/skills.json'),
    JSON.stringify([
      {
        id: MARKERS[1],
        name: `Helper ${MARKERS[0]}`,
        description: MARKERS[2],
        category: 'planning',
        origin: 'first-party',
        source: { type: 'first-party', path: `skills/${MARKERS[1]}` },
      },
    ]),
  );
  writeFileSync(
    join(dir, 'registry/access.json'),
    JSON.stringify([
      {
        consumer: 'gateway',
        skill: 'ecosystem-config',
        agents: ['claude-code'],
        releases: ['1.0.0'],
        authorizedBy: `Owner ${MARKERS[3]}`,
        authorizedAt: '2026-10-31',
        note: `grant ${MARKERS[3]}`,
      },
    ]),
  );
  mkdirSync(join(dir, `library/${MARKERS[1]}/1.0.0`), { recursive: true });
  writeFileSync(join(dir, `library/${MARKERS[1]}/1.0.0/SKILL.md`), `${MARKERS[0]}\n`);
  return dir;
}

const read = (n: string) =>
  JSON.parse(readFileSync(join(repo, 'registry', `${n}.json`), 'utf8')) as unknown;
const built = buildCatalog({
  skills: read('skills'),
  consumers: read('consumers'),
  integrations: read('integrations'),
  evidence: read('evidence'),
  sources: read('sources'),
  releases: read('releases'),
  evaluations: read('evaluations'),
  updates: read('updates'),
});
if (!built.ok) throw new Error(built.errors.join('\n'));
const catalog: Catalog = built.catalog;
const text = (s: string) =>
  s
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const page = (route: Parameters<typeof Page>[0]['route'], lang?: string) => {
  if (lang) globalThis.localStorage = { getItem: () => lang } as unknown as Storage;
  try {
    return renderToString(
      <I18nProvider>
        <Page route={route} catalog={catalog} />
      </I18nProvider>,
    );
  } finally {
    if (lang) delete (globalThis as { localStorage?: unknown }).localStorage;
  }
};

describe('ES24 production artifacts contain no private data', () => {
  it('a real build with a private root configured emits no private marker in any file, source map or log', () => {
    const priv = privateRoot();
    const root = tmp('es24-site-');
    cpSync(join(repo, 'registry'), join(root, 'registry'), { recursive: true });
    writeFileSync(join(root, 'private.local.json'), JSON.stringify({ root: priv }));
    const dir = join(root, 'apps/web');
    mkdirSync(dir, { recursive: true });
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
    const r = spawnSync(
      process.execPath,
      [join(web, 'node_modules/vite/bin/vite.js'), 'build', '--sourcemap'],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, ECOSYSTEM_SKILLS_PRIVATE_ROOT: priv },
      },
    );
    expect(r.status, r.stderr + r.stdout).toBe(0);
    const files = readdirSync(join(dir, 'dist'), { recursive: true })
      .map(String)
      .filter((f) => !f.endsWith('/'));
    const maps = files.filter((f) => f.endsWith('.map'));
    expect(maps.length).toBeGreaterThan(0); // source maps were produced and are searched too
    const all = files
      .map((f) => {
        try {
          return readFileSync(join(dir, 'dist', f), 'latin1');
        } catch {
          return '';
        }
      })
      .join('\n');
    // control: the scan sees the public catalog
    expect(all).toContain('"id": "ecosystem-config"');
    for (const m of MARKERS) {
      expect(all, m).not.toContain(m);
      expect(r.stdout + r.stderr, m).not.toContain(m);
    }
    expect(all).not.toContain(priv);
    expect(all).not.toContain('private.local.json');
    // ES25: installer policy and its messages stay in the CLI; the site only describes the recorded policy
    expect(all).not.toContain('ECOSYSTEM_SKILLS_PRIVATE_ROOT');
    expect(all).not.toContain('fail closed');
  }, 120_000);

  it('the public catalog never carries a visibility other than public', () => {
    for (const k of ['skills', 'sources', 'releases'] as const)
      for (const x of catalog[k] as { visibility?: string }[])
        expect(x.visibility ?? 'public').toBe('public');
  });
});

describe('ES24 website: public ecosystem integration skills', () => {
  it('shows the integration, its read-only interface, mapped projects and required permissions', () => {
    const c = text(page({ page: 'skill', id: 'ecosystem-config' }));
    expect(c).toContain('Ecosystem integration');
    expect(c).toContain('Configuration registry');
    expect(c).toContain('dist/ecosystem.json');
    expect(c).toContain('Permissions required Read access to a local checkout of the source.');
    for (const p of ['Playnest · playnest', 'Gateway · gateway', 'FM Studios · fmStudios'])
      expect(c).toContain(p);
    const html = page({ page: 'skill', id: 'ecosystem-config' });
    expect(html).toContain('href="https://github.com/Fikrimarzuki/ecosystem-config"');
    expect(c).toContain('Formerly: config-ecosystem');
  });

  it('names the private asset repository without linking it', () => {
    const html = page({ page: 'skill', id: 'ecosystem-assets' });
    const a = text(html);
    expect(a).toContain('Asset catalog');
    expect(a).toContain('ecosystem-assets (private repository; not linked)');
    expect(html).not.toMatch(/href="https:\/\/github\.com\/[^"]*ecosystem-assets/);
    expect(a).toContain('Momee');
  });

  it('other skills have no integration section', () => {
    expect(text(page({ page: 'skill', id: 'grilling' }))).not.toContain('Ecosystem integration');
  });

  it('explains private skills generically, in English and Indonesian, with no private data', () => {
    expect(text(page({ page: 'dashboard' }))).toContain(
      'This site contains no trace of them: no names, descriptions, sources or counts.'.replace(
        'This',
        'this',
      ),
    );
    expect(text(page({ page: 'dashboard' }, 'id'))).toContain('Skill privat');
    expect(text(page({ page: 'skill', id: 'ecosystem-assets' }, 'id'))).toContain(
      'Integrasi ekosistem',
    );
  });
});
