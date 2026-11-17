import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadRegistry, type Catalog } from '@ecosystem-skills/catalog';
import { I18nProvider } from '../i18n.tsx';
import { ID } from '../locales/id.ts';
import LandingPrototype, { PROTOTYPE_PATHS } from './index.tsx';
import { overworldDesktop, overworldMobile } from './overworld.tsx';
import { PT_ID } from './strings.ts';

/*
 * Concept B (Archive Overworld) and the prototype index: a development reference since ES28.5 (Concept A became the
 * landing page; its tests are in es285.test.tsx). What must hold: B still renders from catalog data, keeps the same
 * plain semantics, and stays out of production (es285.test.tsx and the build check).
 */
const repo = resolve(__dirname, '../../../..');
const catalog: Catalog = loadRegistry(repo).catalog;
const html = (which: 'index' | 'b', lang = 'en') => {
  globalThis.localStorage = {
    getItem: (k: string) => (k === 'lang' ? lang : null),
    setItem: () => {},
  } as unknown as Storage;
  try {
    return renderToString(
      <I18nProvider>
        <LandingPrototype which={which} catalog={catalog} />
      </I18nProvider>,
    );
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
};
const text = (s: string) =>
  s
    .replace(/<style>[^]*?<\/style>/g, ' ')
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('Concept B development reference', () => {
  it('renders the map with four real links and live counts, and says it is not the landing page', () => {
    const h = html('b');
    const t = text(h);
    for (const [id, href] of [
      ['skills', '/skills'],
      ['resources', '/resources'],
      ['sources', '/sources'],
      ['ecosystem', '/ecosystem'],
    ])
      expect(
        h.match(new RegExp(`<a href="${href}" class="lp-spot" data-spot="${id}"`, 'g')),
        id,
      ).toHaveLength(2);
    expect(t).toContain(`Skill Library ${catalog.skills.length} skills . Browse skills`);
    expect(t).toContain('Concept B was not selected');
    expect(h.match(/<h1/g)).toHaveLength(1);
  });
  it('the index links the landing page (Concept A) and the reference (Concept B)', () => {
    const h = html('index');
    expect(h).toContain('href="/"');
    expect(h).toContain(`href="${PROTOTYPE_PATHS.b}"`);
    expect(h).not.toContain('living-library');
  });
  it('no game progress wording, in either language', () => {
    for (const lang of ['en', 'id'])
      expect(text(html('b', lang)), lang).not.toMatch(
        /\b(XP|level ?up|levels?|rarity|loot|reward|achievement|unlock(ed)?|equip(ped)?)\b/i,
      );
  });
  it('every map destination is inside the map, with selection brackets', () => {
    for (const make of [overworldDesktop, overworldMobile]) {
      const def = make();
      for (const s of def.spots) {
        const [x, y, w, h] = s.box;
        expect(x >= 0 && y >= 0 && x + w <= def.w && y + h <= def.h, s.id).toBe(true);
        expect(
          def.layers.some((l) => l.cls === `lp-hl lp-hl-${s.id}`),
          s.id,
        ).toBe(true);
      }
    }
  });
});

describe('prototype translations', () => {
  const sources = readdirSync(__dirname)
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))
    .map((f) => readFileSync(join(__dirname, f), 'utf8'));
  const strings = new Set<string>();
  for (const src of sources)
    for (const m of src.matchAll(/\bpt\(\s*'((?:[^'\\]|\\.)*)'/gs))
      strings.add(m[1]!.replace(/\\'/g, "'"));
  const placeholders = (s: string) =>
    [...s.matchAll(/\{(\w+)\}/g)]
      .map((m) => m[1])
      .sort()
      .join(',');
  it('every prototype string has Indonesian (here or in the site dictionary), with the same placeholders', () => {
    for (const s of strings) {
      const id = PT_ID[s] ?? ID[s];
      expect(id, s).toBeTruthy();
      expect(placeholders(id!), s).toBe(placeholders(s));
    }
  });
  it('no prototype translation is left over or duplicates the site dictionary', () => {
    for (const k of Object.keys(PT_ID)) {
      expect(strings.has(k), `unused: ${k}`).toBe(true);
      expect(ID[k], `already in locales/id.ts: ${k}`).toBeUndefined();
    }
  });
});
