import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadRegistry, type Catalog } from '@ecosystem-skills/catalog';
import { App, Page } from './App.tsx';
import { ARCHIVIST } from './art.tsx';
import { I18nProvider } from './i18n.tsx';
import { ARCHIVIST_LARGE } from './landing/archivist.ts';
import { libraryDesktop, libraryMobile } from './landing/library.tsx';
import { SPOT_GLYPH } from './landing/stage.tsx';
import { ecosystemSkills, summarize } from './lib.ts';

/*
 * ES28.5 Living Library: the production landing page. What must hold: the room is the landing page, its four signs
 * are real links with live counts, the three direct actions never depend on the scene, the phone gets its own
 * composition, nothing turns status into a game, and the unselected prototype never reaches production.
 */
const repo = resolve(__dirname, '../../..');
const catalog: Catalog = loadRegistry(repo).catalog;
const home = (lang = 'en', c: Catalog = catalog) => {
  globalThis.localStorage = {
    getItem: (k: string) => (k === 'lang' ? lang : null),
    setItem: () => {},
  } as unknown as Storage;
  try {
    return renderToString(
      <I18nProvider>
        <Page route={{ page: 'home' }} catalog={c} />
      </I18nProvider>,
    );
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
};
const text = (s: string) =>
  s
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const SIGNS = [
  ['skills', '/skills', 'Skill Codex', 'Browse skills'],
  ['resources', '/resources', 'Tool Workshop', 'Explore resources'],
  ['sources', '/sources', 'Source Archive', 'View sources'],
  ['ecosystem', '/ecosystem', 'Guild Registry', 'Explore FM Ecosystem skills'],
] as const;
const count = (id: string, c: Catalog) =>
  id === 'skills'
    ? `${c.skills.length} skills`
    : id === 'resources'
      ? `${c.resources.length} resources`
      : id === 'sources'
        ? `${c.sources.length} sources`
        : `${ecosystemSkills(c).length} skill${ecosystemSkills(c).length === 1 ? '' : 's'}`;

describe('ES28.5 the Living Library is the landing page', () => {
  const h = home();
  it('renders the room (wide and phone compositions) as the hero, with one h1 and no skipped heading', () => {
    expect(h).toMatch(/<section aria-labelledby="hero-h" class="lp-hero lp-library" data-board=""/);
    expect(h).toContain('class="lp-canvas lp-wide"');
    expect(h).toContain('class="lp-canvas lp-phone"');
    const levels = [...h.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    levels.forEach((l, i) => i && expect(l - levels[i - 1]!).toBeLessThanOrEqual(1));
    expect(/<h1[^>]*>([^<]*)<\/h1>/.exec(h)![1]).toBe(
      'One place to manage the skills your AI agents use',
    );
  });
  it('the four signs are real links in each composition, with icon, name, live count and destination', () => {
    for (const [id, href, name, action] of SIGNS) {
      const signs = [
        ...h.matchAll(
          new RegExp(`<a href="${href}" class="lp-spot" data-spot="${id}"[^>]*>.*?</a>`, 'gs'),
        ),
      ].map((m) => m[0]);
      expect(signs, id).toHaveLength(2);
      for (const s of signs) {
        expect(text(s).trim(), id).toBe(`${name} ${count(id, catalog)} . ${action}`);
        expect(s, id).toMatch(
          /<svg aria-hidden="true" focusable="false"[^>]*class="cw-px cw-glyph[^"]*lp-plate-icon/,
        );
      }
    }
    expect(Object.keys(SPOT_GLYPH).sort()).toEqual(['ecosystem', 'resources', 'skills', 'sources']);
  });
  it('the three direct actions are ordinary links outside the scene', () => {
    const intro = h.slice(h.indexOf('class="lp-intro"'), h.indexOf('class="lp-canvas'));
    for (const [href, label] of [
      ['/skills', 'Browse skills'],
      ['/resources', 'Explore resources'],
      ['/sources', 'View sources'],
    ])
      expect(intro).toMatch(
        new RegExp(
          `<a href="${href}" class="btn-(primary|secondary) cw-pointer lp-btn">${label}</a>`,
        ),
      );
  });
  it('every count comes from the catalog: change the catalog and the signs and numbers change', () => {
    const small: Catalog = {
      ...catalog,
      skills: catalog.skills.slice(0, 7),
      resources: catalog.resources.slice(0, 2),
      sources: catalog.sources.slice(0, 3),
    };
    const t = text(home('en', small));
    expect(t).toContain('Skill Codex 7 skills . Browse skills');
    expect(t).toContain('Tool Workshop 2 resources');
    expect(t).toContain('Source Archive 3 sources');
    expect(t).toContain('7 skills · 2 resources · 3 sources, all read-only.');
    expect(t).toContain(`${summarize(small).skills} Registered skills`);
  });
  it('keeps the honest content: features, seven separate facts, limits, Gateway, Help & Contact and GitHub', () => {
    const t = text(h);
    for (const s of [
      'What is this website?',
      'How a skill is tracked',
      'Approved is not installed. Assigned is not activated. Activated is not verified.',
      'What this site does and does not do',
      'Explore More Projects',
      'Open Help & Contact',
      'View the source on GitHub',
      'Skill tree by category',
    ])
      expect(t, s).toContain(s);
    // the old "Where to start" windows repeated the scene's signs: consolidated away
    expect(t).not.toContain('Where to start');
  });
  it('renders in Indonesian, signs included', () => {
    const t = text(home('id'));
    for (const s of [
      'Kodeks Skill',
      'Bengkel Alat',
      'Arsip Sumber',
      'Daftar Serikat',
      'Jelajahi sumber daya',
      'Lihat sumber',
      'Satu tempat untuk mengelola skill yang digunakan agen AI Anda',
    ])
      expect(t, s).toContain(s);
  });
  it('before the catalog loads, the room, the signs and the actions are already there', () => {
    const g = globalThis as Record<string, unknown>;
    g.document = { documentElement: { classList: { contains: () => false, toggle() {} } } };
    g.location = { pathname: '/', search: '', hash: '' };
    try {
      const s = renderToString(<App />);
      expect(s).toContain('href="/skills" class="lp-spot"');
      expect(text(s)).toContain('Loading catalog…');
    } finally {
      delete g.document;
      delete g.location;
    }
  });
});

describe('ES28.5 security semantics stay plain on the landing page', () => {
  it('no game progress: no XP, levels, rarity, loot, unlocking, equipping or rewards, in either language', () => {
    for (const lang of ['en', 'id']) {
      const t = text(home(lang))
        .replace('It is not a progression: nothing here is locked or unlocked.', '')
        .replace('Ini bukan jenjang kemajuan: tidak ada yang terkunci atau terbuka di sini.', '');
      expect(t, lang).not.toMatch(
        /\b(XP|level ?up|levels?|rarity|rare|epic|legendary|loot|reward|achievement|unlock(ed)?|equip(ped)?|power)\b/i,
      );
    }
  });
  it('the scene installs and connects nothing: no forms, no buttons, no endpoint links; art hidden', () => {
    const h = home();
    const hero = h.slice(
      h.indexOf('class="lp-hero'),
      h.indexOf('aria-label="The registry in numbers"'),
    );
    expect(hero).not.toMatch(/<form|<button/);
    for (const r of catalog.resources.filter((x) => x.mcp?.officialEndpoint))
      expect(h).not.toContain(`href="${r.mcp!.officialEndpoint}"`);
    for (const s of h.match(/<svg[^>]*>/g) ?? [])
      expect(s).toMatch(/aria-hidden="true"[^>]*focusable="false"/);
  });
});

describe('ES28.5 the room', () => {
  it('the large Archivist keeps the canonical sprite: 2× its size, its palette, never outside its silhouette', () => {
    expect(ARCHIVIST_LARGE).toHaveLength(ARCHIVIST.length * 2);
    for (const row of ARCHIVIST_LARGE) {
      expect(row).toHaveLength(ARCHIVIST[0]!.length * 2);
      expect(row).toMatch(/^[.ohkerlpgsHKLPGS]+$/);
    }
    for (let y = 0; y < ARCHIVIST_LARGE.length; y++)
      for (let x = 0; x < ARCHIVIST_LARGE[0]!.length; x++)
        if (ARCHIVIST_LARGE[y]![x] !== '.')
          expect(ARCHIVIST[y >> 1]![x >> 1], `(${x}, ${y})`).not.toBe('.');
  });
  it('both compositions have the four places inside the room, each sign inside its place, each with brackets', () => {
    for (const [name, make] of Object.entries({ libraryDesktop, libraryMobile })) {
      const def = make();
      expect(def.spots.map((s) => s.id).sort(), name).toEqual([
        'ecosystem',
        'resources',
        'skills',
        'sources',
      ]);
      for (const s of def.spots) {
        const [x, y, w, h] = s.box;
        expect(x >= 0 && y >= 0 && x + w <= def.w && y + h <= def.h, `${name} ${s.id} box`).toBe(
          true,
        );
        const [px, py] = s.plate;
        const left = s.plateEnd ? px - (s.plateMin ?? 0) : px;
        expect(left >= x && px <= x + w + 1 && py >= y && py < y + h, `${name} ${s.id} sign`).toBe(
          true,
        );
        expect(s.plateMin, `${name} ${s.id} sign meets its chains`).toBeGreaterThan(30);
        expect(
          def.layers.some((l) => l.cls === `lp-hl lp-hl-${s.id}`),
          `${name} ${s.id}`,
        ).toBe(true);
      }
    }
    // a phone is not a shrunken desktop: its own, taller-than-wide composition
    const d = libraryDesktop(),
      m = libraryMobile();
    expect(d.w / d.h).toBeGreaterThan(1.5);
    expect(m.w / m.h).toBeLessThan(1);
  });
  it('every colour is a token with a morning value, and every animation is keyed to the setting and finite', () => {
    const css = readFileSync(join(__dirname, 'landing/landing.css'), 'utf8');
    const day = css.slice(css.indexOf('.lp-root {'), css.indexOf('html.dark .lp-root {'));
    const used = new Set<string>();
    for (const make of [libraryDesktop, libraryMobile])
      for (const l of make().layers.flatMap(function walk(x): (typeof x)[] {
        return [x, ...(x.kids ?? []).flatMap(walk)];
      }))
        for (const r of l.p?.out ?? []) if (!r[4].startsWith('px:')) used.add(r[4]);
    for (const c of used) expect(day, c).toContain(`--lp-${c}:`);
    for (const m of css.matchAll(/^([^\n{]*)\{\s*animation: [^;]*;/gm)) {
      expect(m[1], m[0]).toContain("html[data-motion='on']");
      expect(m[0]).not.toMatch(/infinite/);
    }
  });
});

describe('ES28.5 no prototype leakage', () => {
  const src = __dirname;
  const files = readdirSync(src, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name))
    .filter((d) => !d.parentPath.includes('prototypes'))
    .map((d) => join(d.parentPath, d.name));
  it('only App.tsx refers to the prototypes, lazily, behind the build-time flag; the landing never does', () => {
    const users = files.filter((f) => readFileSync(f, 'utf8').includes('prototypes/'));
    expect(users.map((f) => f.slice(src.length + 1))).toEqual(['App.tsx']);
    const app = readFileSync(join(src, 'App.tsx'), 'utf8');
    expect(app).toMatch(
      /LANDING_PROTOTYPES \? lazy\(\(\) => import\('\.\/prototypes\/index\.tsx'\)\) : null/,
    );
    expect(app).not.toMatch(/^import [^\n]*prototypes/m);
    for (const f of [
      'pages/Home.tsx',
      'landing/stage.tsx',
      'landing/library.tsx',
      'landing/pixel.tsx',
    ])
      expect(readFileSync(join(src, f), 'utf8'), f).not.toMatch(
        /overworld|prototypes\/|PT_ID|usePt|walker|walk\b/,
      );
  });
  it('the living-library prototype route is gone; only the dev reference paths remain behind the flag', () => {
    const app = readFileSync(join(src, 'App.tsx'), 'utf8');
    expect(app).not.toContain('living-library');
    expect(app).toContain('archive-overworld');
  });
});
