import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildCatalog, type Catalog } from '@ecosystem-skills/catalog';
import { NAV, Page } from './App.tsx';
import { I18nProvider } from './i18n.tsx';
import {
  describeFilter,
  ecosystemSkills,
  explainEmpty,
  filterSkills,
  lifecycle,
  ownershipLabel,
  parseRoute,
  distributionLabel,
  type Skill,
} from './lib.ts';
import { legacyToClean } from './router.ts';

/*
 * ES25 website: the FM Ecosystem section, ownership and distribution in discovery and on skill pages. Everything is
 * rendered from the real registry; the restricted skills' install policy is described, never enforced, by the site.
 */
const repo = resolve(__dirname, '../../..');
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
const html = (route: Parameters<typeof Page>[0]['route'], lang?: string, c: Catalog = catalog) => {
  if (lang) globalThis.localStorage = { getItem: () => lang } as unknown as Storage;
  try {
    return renderToString(
      <I18nProvider>
        <Page route={route} catalog={c} />
      </I18nProvider>,
    );
  } finally {
    if (lang) delete (globalThis as { localStorage?: unknown }).localStorage;
  }
};
const page = (route: Parameters<typeof Page>[0]['route'], lang?: string, c?: Catalog) =>
  text(html(route, lang, c));

describe('ES25 FM Ecosystem route and navigation', () => {
  it('has a clean URL and a navigation entry next to Skills; old hash routes still redirect', () => {
    expect(parseRoute('/ecosystem')).toEqual({ page: 'ecosystem' });
    expect(parseRoute('/ecosystem/')).toEqual({ page: 'ecosystem' });
    expect(parseRoute('/ecosystem/x')).toMatchObject({ page: 'notfound' });
    const paths = NAV.map((n) => n.path);
    expect(paths.indexOf('/ecosystem')).toBe(paths.indexOf('/skills') + 1);
    expect(NAV.find((n) => n.path === '/ecosystem')).toMatchObject({ label: 'FM Ecosystem' });
    expect(legacyToClean({ search: '', hash: '#/skills?origin=first-party' })).toBe(
      '/skills?origin=first-party',
    );
    expect(legacyToClean({ search: '', hash: '#/skills/ecosystem-config' })).toBe(
      '/skills/ecosystem-config',
    );
  });
});

describe('ES25 FM Ecosystem page', () => {
  it('lists exactly the skills with explicit FM Ecosystem ownership, from the canonical catalog', () => {
    expect(ecosystemSkills(catalog).map((s) => s.id)).toEqual([
      'ecosystem-assets',
      'ecosystem-config',
    ]);
    expect(ecosystemSkills(catalog)).toEqual(filterSkills(catalog, { owner: 'fm-ecosystem' }));
  });

  it('shows ownership, visibility, distribution, integrations, projects, compatibility and review from registry data', () => {
    const h = html({ page: 'ecosystem' });
    const c = text(h);
    expect(c).toContain('FM Ecosystem skills');
    expect(c).toContain('Skills developed specifically for FM Ecosystem projects');
    for (const s of ['Ecosystem Assets', 'Ecosystem Config']) expect(c).toContain(s);
    expect(c).toContain('Restricted · Owner-only');
    expect(c).toContain('Owner-only, through the managed command line.');
    expect(c).toContain('Not reviewed; no curated release');
    expect(c).toContain('No curated release yet; nothing can be installed.');
    expect(c).toContain('Standard SKILL.md; not yet tested with an agent.');
    expect(c).toMatch(/Related projects Gateway, Momee/); // Ecosystem Assets
    expect(c).toMatch(/Related projects FM Studios, Gateway, Hearthside, Playdeck, Playnest/);
    expect(c).toMatch(/Integrations Ecosystem Config/);
    expect(h).toContain('href="/skills/ecosystem-assets"');
    expect(h).toContain('href="/skills/ecosystem-config"');
    expect(h).toContain('href="/skills?owner=fm-ecosystem"');
    // no claim the registry does not support, and nothing that looks like an install control
    expect(c).not.toMatch(/\bApproved\b|\binstalled for\b|Verified on/);
    expect(h).not.toMatch(/<button|<form/);
  });

  it('heading order and landmarks stay accessible', () => {
    const h = html({ page: 'ecosystem' });
    const levels = [...h.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++)
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
  });

  it('is translated into Indonesian', () => {
    const c = page({ page: 'ecosystem' }, 'id');
    expect(c).toContain('Skill FM Ecosystem');
    expect(c).toContain('Terbatas · Khusus pemilik');
    expect(c).toContain('Khusus pemilik, melalui baris perintah terkelola.');
    expect(c).toContain('Publik untuk dibaca');
  });

  it('says so plainly when no skill is FM Ecosystem-owned', () => {
    const none = {
      ...catalog,
      skills: catalog.skills.filter((s) => s.ownership !== 'fm-ecosystem'),
    };
    expect(page({ page: 'ecosystem' }, undefined, none)).toContain(
      'No FM Ecosystem skills are registered.',
    );
  });
});

describe('ES25 discovery filters', () => {
  it('filter by ownership and distribution, alone and combined with search and other filters', () => {
    expect(filterSkills(catalog, { owner: 'fm-ecosystem' })).toHaveLength(2);
    expect(filterSkills(catalog, { owner: 'third-party' })).toHaveLength(243);
    expect(filterSkills(catalog, { owner: 'first-party' }).map((s) => s.id)).toEqual([
      'momee-character-art',
      'skill-discovery-smoke-test',
    ]);
    expect(filterSkills(catalog, { distribution: 'restricted' })).toHaveLength(2);
    expect(filterSkills(catalog, { distribution: 'open' })).toHaveLength(245);
    expect(filterSkills(catalog, { distribution: 'not-distributable' })).toHaveLength(0);
    expect(
      filterSkills(catalog, { owner: 'fm-ecosystem', q: 'config', origin: 'first-party' }).map(
        (s) => s.id,
      ),
    ).toEqual(['ecosystem-config']);
    expect(filterSkills(catalog, { q: 'FM Ecosystem' }).map((s) => s.id)).toEqual([
      'ecosystem-assets',
      'ecosystem-config',
    ]);
    // an empty combination explains which filter to drop
    const e = explainEmpty(catalog, { owner: 'fm-ecosystem', origin: 'external' });
    expect(e.active.map((a) => a.label)).toEqual(['Source Third-party', 'Owner FM Ecosystem']);
    expect(e.relaxable.map((r) => [r.key, r.count])).toEqual([
      ['origin', 2],
      ['owner', 243],
    ]);
    expect(describeFilter('distribution', 'restricted')).toBe('Distribution Restricted');
  });

  it('live in the URL: a filtered link restores them and they render as selected', () => {
    const route = parseRoute('/skills?owner=fm-ecosystem&distribution=restricted');
    expect(route).toEqual({
      page: 'skills',
      query: { owner: 'fm-ecosystem', distribution: 'restricted' },
    });
    const h = html(route);
    expect(text(h)).toContain('2 of 247 skills');
    expect(h).toMatch(/<option value="fm-ecosystem" selected="">FM Ecosystem<\/option>/);
    expect(h).toMatch(/<option value="restricted" selected="">Restricted<\/option>/);
    for (const label of ['Owner', 'Distribution'])
      expect(h).toContain(`<span class="sr-only">${label}</span>`);
    // the badges appear on the cards
    expect(text(h)).toContain('Restricted · Owner-only');
    expect(text(h)).toContain('Authorizations are not published');
    expect(text(h)).not.toContain('Not assigned');
    expect(text(html(parseRoute('/skills?owner=fm-ecosystem'), 'id'))).toContain('Semua pemilik');
  });
});

describe('ES25 skill detail', () => {
  it('a restricted FM Ecosystem skill explains its distribution and offers no install action', () => {
    const h = html({ page: 'skill', id: 'ecosystem-config' });
    const c = text(h);
    expect(c).toContain('Ownership and distribution');
    expect(c).toContain(
      'This skill is developed for FM Ecosystem projects. Managed installation is restricted to authorized consumers.',
    );
    expect(c).toContain('This site has no install action and enforces nothing.');
    expect(c).toContain('Maintained by FM Ecosystem');
    expect(c).toContain('Visibility Public');
    expect(c).toContain(
      'Required authorization An explicit private authorization for the project, version and agent, for projects the owner controls only.',
    );
    expect(c).toContain('Review and approval Not reviewed; no curated release');
    expect(c).toContain('Curated releases No curated release yet.');
    expect(c).toContain(
      'Installation status Not published: restricted installs are recorded on the owner’s machine only.',
    );
    expect(c).toContain('Supported agents Not declared; not yet tested with an agent.');
    expect(c).toMatch(/Ecosystem projects FM Studios Gateway Hearthside Playdeck Playnest/);
    expect(c).toContain('Developed for FM Ecosystem projects. The instructions are public');
    expect(h).not.toMatch(/<button[^>]*>[^<]*[Ii]nstall/);
    // lifecycle does not pretend to know assignments or installs
    const rows = lifecycle(
      catalog,
      catalog.skills.find((s) => s.id === 'ecosystem-config')!,
    );
    expect(
      rows
        .filter((r) => ['installed', 'assigned', 'activated'].includes(r.key))
        .map((r) => r.value),
    ).toEqual(['Not published', 'Not published', 'Not published']);
    expect(rows.find((r) => r.key === 'approved')!.value).toBe('No approved release');
  });

  it('an open third-party skill keeps its existing presentation, with ownership derived and labelled so', () => {
    const c = page({ page: 'skill', id: 'grilling' });
    expect(c).toContain('Maintained by Third-party Not declared; derived from the source.');
    expect(c).toContain('Distribution Open');
    expect(c).not.toContain('developed for FM Ecosystem projects');
  });

  it('is translated into Indonesian', () => {
    const c = page({ page: 'skill', id: 'ecosystem-assets' }, 'id');
    expect(c).toContain('Kepemilikan dan distribusi');
    expect(c).toContain('Pemasangan terkelola dibatasi untuk konsumer yang diotorisasi.');
    expect(c).toContain('Dipelihara oleh FM Ecosystem');
  });

  it('missing or invalid metadata degrades to derived or "Unknown" labels, never to a false claim', () => {
    const fm = catalog.skills.find((s) => s.id === 'ecosystem-config')!;
    const bogus = {
      ...fm,
      ownership: 'someone',
      distribution: { policy: 'whatever' },
    } as unknown as Skill;
    expect(ownershipLabel(bogus)).toBe('Unknown');
    expect(distributionLabel(bogus)).toBe('Unknown');
    const bare = { ...fm, ownership: undefined, distribution: undefined } as Skill;
    expect(ownershipLabel(bare)).toBe('Other first-party');
    expect(distributionLabel(bare)).toBe('Open');
    const c = page({ page: 'skill', id: 'ecosystem-config' }, undefined, {
      ...catalog,
      skills: catalog.skills.map((s) => (s.id === fm.id ? bogus : s)),
    });
    expect(c).toContain('Maintained by Unknown');
    expect(c).not.toContain('Managed installation is restricted to authorized consumers.');
  });
});
