import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadRegistry, type Catalog } from '@ecosystem-skills/catalog';
import { Page } from './App.tsx';
import { Highlight, matchRanges } from './highlight.tsx';
import { I18nProvider } from './i18n.tsx';
import { filterSkills, hiddenMatch, skillSourceLink } from './lib.ts';
import { viewKey } from './view.tsx';

/* ES27.1 Skills page: filter sidebar, Cards/List, search highlighting. Rendered from the real registry. */
const repo = resolve(__dirname, '../../..');
const catalog: Catalog = loadRegistry(repo).catalog;
const text = (s: string) =>
  s
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const html = (query: Record<string, string> = {}, store: Record<string, string> = {}) => {
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: () => {},
  } as unknown as Storage;
  try {
    return renderToString(
      <I18nProvider>
        <Page route={{ page: 'skills', query }} catalog={catalog} />
      </I18nProvider>,
    );
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
};
const list = { [viewKey('skills')]: 'list' };

describe('ES27.1 highlighting', () => {
  it('marks every occurrence, case-insensitively, as text (never as HTML)', () => {
    expect(matchRanges('Grill the grill GRILL', 'grill')).toEqual([
      [0, 5],
      [10, 15],
      [16, 21],
    ]);
    const out = renderToString(<Highlight text="Design dEsign" query="design" />);
    expect(out.match(/<mark/g)?.length).toBe(2);
    expect(out).toContain('>Design</mark>');
  });
  it('escapes regex characters, handles Unicode and an empty query', () => {
    expect(matchRanges('a.b (c) [d] a.b', 'a.b')).toEqual([
      [0, 3],
      [12, 15],
    ]);
    expect(matchRanges('x (c) y', '(c)')).toEqual([[2, 5]]);
    expect(matchRanges('naïve café ÉCOLE école', 'école')).toHaveLength(2);
    expect(matchRanges('日本語のテキスト', '本語')).toEqual([[1, 3]]);
    expect(matchRanges('anything', '')).toEqual([]);
    expect(matchRanges('anything', '   ')).toEqual([]);
    expect(renderToString(<Highlight text="plain" query="" />)).toBe('plain');
  });
  it('cannot inject HTML: markup in the text or the query is escaped', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const out = renderToString(<Highlight text={`hi ${evil} there`} query="img" />);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;');
    expect(renderToString(<Highlight text="a b" query={evil} />)).toBe('a b');
    const page = html({ q: evil });
    expect(page).not.toContain('<img src=x');
    expect(page).toContain('No skills match these filters');
  });
  it('page results highlight names, descriptions and sources in both views and clear with the query', () => {
    for (const store of [{}, list]) {
      const h = html({ q: 'design' }, store);
      expect(h).toContain('<mark');
      const marked = [...h.matchAll(/<mark[^>]*>([^<]*)<\/mark>/g)].map((m) => m[1]!.toLowerCase());
      expect(marked.length).toBeGreaterThan(5);
      expect(new Set(marked)).toEqual(new Set(['design'])); // nothing unrelated is highlighted
      expect(html({}, store)).not.toContain('<mark');
    }
  });
  it('the highlight follows the existing search: the whole trimmed query, not separate words', () => {
    const none = filterSkills(catalog, { q: 'design zzzqqq' });
    expect(none).toHaveLength(0);
    expect(html({ q: 'design zzzqqq' })).not.toContain('<mark');
  });
  it('searching never changes review or approval data', () => {
    const before = JSON.stringify(catalog.skills.map((s) => [s.id, s.review.status]));
    html({ q: 'antislop' }, list);
    expect(JSON.stringify(catalog.skills.map((s) => [s.id, s.review.status]))).toBe(before);
    expect(filterSkills(catalog, { q: 'antislop' }).length).toBeGreaterThan(0);
  });
});

describe('ES27.1 filter sidebar', () => {
  it('has each of the seven filters exactly once, with visible labels', () => {
    const h = html();
    for (const label of [
      'Category',
      'Source',
      'Owner',
      'Review and approval status',
      'Content availability',
      'Agent verification evidence',
      'Distribution',
    ])
      expect((h.match(new RegExp(`>${label}</span><select`, 'g')) ?? []).length, label).toBe(1);
    expect((h.match(/<select/g) ?? []).length).toBe(7);
    expect((h.match(/type="search"/g) ?? []).length).toBe(1);
  });
  it('has an accessible Filters disclosure for narrow screens, collapsed by default', () => {
    const h = html();
    expect(h).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="[^"]+"/);
    const id = /aria-controls="([^"]+)"/.exec(h)![1]!;
    expect(h).toMatch(
      new RegExp(`id="${id.replace(/:/g, ':')}"[^>]*class="[^"]*hidden[^"]*lg:block`),
    );
  });
  it('shows active-filter indicators, clear-all and combined counts from the URL', () => {
    const h = html({ owner: 'fm-ecosystem', distribution: 'restricted', q: 'config' });
    expect(text(h)).toContain('2 active');
    expect(text(h)).toContain('Clear all');
    expect(h).toContain('border-indigo-500');
    expect(text(h)).toContain(
      `${filterSkills(catalog, { owner: 'fm-ecosystem', distribution: 'restricted', q: 'config' }).length} of ${catalog.skills.length} skills`,
    );
    expect(text(html())).not.toContain('Clear all');
  });
  it('keeps the security filters and combines every filter with search', () => {
    const all = filterSkills(catalog, { status: 'reviewed' });
    expect(all.length).toBeGreaterThanOrEqual(15);
    const narrowed = filterSkills(catalog, { status: 'reviewed', q: 'antislop' });
    expect(narrowed.length).toBeGreaterThan(0);
    expect(narrowed.every((s) => all.includes(s))).toBe(true);
    expect(text(html({ status: 'reviewed', content: 'curation-blocked' }))).toContain('skills');
    expect(text(html({ q: 'zzz-no-such-skill' }))).toContain('No skills match these filters');
  });
  it('Indonesian renders the sidebar chrome', () => {
    const raw = html({ owner: 'fm-ecosystem' }, { lang: 'id' });
    const t = text(raw);
    expect(t).toContain('Filter');
    expect(t).toContain('1 aktif');
    expect(t).toContain('Hapus semua');
    expect(raw).toContain('aria-label="Tampilkan skill sebagai"');
  });
});

describe('ES27.1 Cards and List', () => {
  it('defaults to Cards and remembers List', () => {
    expect(html()).toContain('sm:grid-cols-2 xl:grid-cols-3');
    expect(html()).not.toContain('md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]');
    const l = html({}, list);
    expect(l).toContain('md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]');
    expect(l).not.toContain('Has warnings');
  });
  it('List has exactly two columns, Skill and Source, and no review, approval or evidence columns', () => {
    const l = html({}, list);
    const head = l.slice(l.indexOf('uppercase'), l.indexOf('<ul aria-label="Skills"'));
    expect(text(head.replace(/^[^>]*>/, '')).trim()).toBe('Skill Source');
    for (const w of [
      'Candidate ·',
      'Approved',
      'Restricted',
      'Explicit run verified',
      'Assigned to',
    ])
      expect(text(l.slice(l.indexOf('<ul aria-label="Skills"'))), w).not.toContain(w);
    expect((l.match(/<li class="space-y-1\.5/g) ?? []).length).toBe(catalog.skills.length);
  });
  it('skill names link to their pages; sources link only to registered or verified upstreams', () => {
    const l = html({}, list);
    for (const s of catalog.skills.slice(0, 40)) expect(l).toContain(`href="/skills/${s.id}"`);
    const ext = catalog.skills.find((s) => s.id === 'fact-checker')!;
    expect(skillSourceLink(catalog, ext).url).toMatch(/^https:\/\/github\.com\//);
    expect(
      skillSourceLink(
        catalog,
        catalog.skills.find((s) => s.origin === 'first-party')!,
      ).url,
    ).toBeUndefined();
    // an unresolved or ambiguous source record yields text only, never a link
    const bad: Catalog = {
      ...catalog,
      sources: catalog.sources.map((x) =>
        x.id === ext.discovery!.source ? { ...x, resolution: 'unresolved' as const } : x,
      ),
    };
    expect(skillSourceLink(bad, ext)).toEqual({ label: skillSourceLink(catalog, ext).label });
  });
  it('shows a short snippet when only a hidden field (a tag) matched', () => {
    const s = catalog.skills.find((x) => x.tags.length)!;
    const tag = s.tags.find(
      (t) => !s.name.toLowerCase().includes(t) && !s.description.toLowerCase().includes(t),
    );
    if (tag) {
      expect(hiddenMatch(s, tag)).toEqual({
        field: 'Tags',
        value: expect.stringContaining(`#${tag}`),
      });
      expect(text(html({ q: tag }, list))).toContain(`Matches · Tags: #${tag}`);
    }
    expect(hiddenMatch(s, s.name)).toBeUndefined();
    expect(hiddenMatch(s, '')).toBeUndefined();
  });
  it('both views show the same results for the same filters', () => {
    const q = { q: 'review', origin: 'external' };
    const ids = (h: string) => [...h.matchAll(/href="\/skills\/([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(ids(html(q, list))).toEqual(ids(html(q)));
  });
});

describe('ES27.1 keeps the ES27 security presentation', () => {
  it('Cards still show review stage and the incomplete-audit badge; detail pages keep the audit', () => {
    const cards = text(html({ q: 'onetake' }));
    expect(cards).toContain('Candidate · reviewed');
    expect(cards).toContain('Review incomplete');
    const detail = text(
      renderToString(
        <I18nProvider>
          <Page route={{ page: 'skill', id: 'onetake' }} catalog={catalog} />
        </I18nProvider>,
      ),
    );
    expect(detail).toContain('Security audit (ES27)');
    expect(detail).toContain('Review incomplete');
    expect(detail.indexOf('Source and provenance')).toBeLessThan(detail.indexOf('Lifecycle'));
  });
  it('restricted distribution stays accurate on cards, and nothing becomes approved', () => {
    const t = text(html({ owner: 'fm-ecosystem' }));
    expect(t).toContain('Restricted · Owner-only');
    expect(t).toContain('Authorizations are not published');
    // Exact set: the six ES6/ES11.2 skills plus the four owner-authorized for Xpenz (2026-11-09). Any other approval fails.
    expect(
      catalog.skills
        .filter((s) => s.review.status === 'approved')
        .map((s) => s.id)
        .sort(),
    ).toEqual(
      [
        'caveman',
        'frontend-design',
        'grilling',
        'ponytail',
        'threejs-asset-pipeline',
        'threejs-lighting',
        'threejs-loaders',
        'threejs-react-three-fiber',
        'verification-before-completion',
        'writing-plans',
      ].sort(),
    );
  });
});
