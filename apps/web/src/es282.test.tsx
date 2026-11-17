import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadRegistry, type Catalog } from '@ecosystem-skills/catalog';
import { Page } from './App.tsx';
import { ARCHIVIST, POSES, gridSize } from './art.tsx';
import { I18nProvider } from './i18n.tsx';
import { resourceExternalUrl, stage } from './lib.ts';
import { viewKey } from './view.tsx';

/*
 * ES28.2 regression checks for the inventory (Resources), archive (Sources) and record (detail) pages, rendered from
 * the real registry. They cover what must not regress when the visual system changes: one-click source links,
 * heading order, section order, no MCP endpoint links, one frame whatever the status, and no leftover old palette.
 */
const repo = resolve(__dirname, '../../..');
const catalog: Catalog = loadRegistry(repo).catalog;
type Route = Parameters<typeof Page>[0]['route'];
/** Each page is rendered once and reused by every check below (rendering all 264 skill pages is the slow part). */
const rendered = new Map<string, string>();
const html = (route: Route, store: Record<string, string> = {}) => {
  const key = JSON.stringify([route, store]);
  if (!rendered.has(key)) rendered.set(key, render(route, store));
  return rendered.get(key)!;
};
const render = (route: Route, store: Record<string, string>) => {
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: () => {},
  } as unknown as Storage;
  try {
    return renderToString(
      <I18nProvider>
        <Page route={route} catalog={catalog} />
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
const decode = (s: string) => s.replace(/&amp;/g, '&');

/** Heading levels in document order; fails on a second h1 or a skipped level (h2 → h4). */
function headingProblems(h: string): string[] {
  const levels = [...h.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  const out: string[] = [];
  if (levels.filter((l) => l === 1).length !== 1)
    out.push(`h1 count ${levels.filter((l) => l === 1).length}`);
  levels.forEach((l, i) => {
    if (i > 0 && l > levels[i - 1]! + 1) out.push(`h${levels[i - 1]} → h${l} at heading ${i + 1}`);
  });
  return out;
}

describe('ES28.2 heading hierarchy', () => {
  it('every skill detail page has one h1 and no skipped heading level (the old Evaluation h2 → h4 is gone)', () => {
    for (const s of catalog.skills)
      expect(headingProblems(html({ page: 'skill', id: s.id })), s.id).toEqual([]);
  });
  it('every resource detail page, and the Resources and Sources lists in both views, too', () => {
    for (const r of catalog.resources)
      expect(headingProblems(html({ page: 'resource', id: r.id })), r.id).toEqual([]);
    for (const view of ['cards', 'list'])
      for (const p of ['resources', 'sources'] as const)
        expect(headingProblems(html({ page: p }, { [viewKey(p)]: view })), `${p} ${view}`).toEqual(
          [],
        );
  });
});

describe('ES28.2 source links: one click from a detail page, at most two from a list', () => {
  it('every external skill page opens its upstream repository from the record summary', () => {
    for (const s of catalog.skills.filter((x) => x.source.type === 'external')) {
      const h = html({ page: 'skill', id: s.id });
      const a = /<a [^>]*data-record-source=""[^>]*>/.exec(h)?.[0];
      expect(a, s.id).toBeDefined();
      if (s.source.type === 'external')
        expect(decode(a!), s.id).toContain(`href="${s.source.upstream.url}"`);
      expect(a).toContain('target="_blank"');
      expect(a).toMatch(/rel="noreferrer noopener"/);
      // ...and that summary comes before every other section.
      expect(h.indexOf('data-record-source'), s.id).toBeLessThan(h.indexOf('id="provenance-h"'));
    }
  });
  it('every resource page opens its verified original source from the record summary', () => {
    for (const r of catalog.resources) {
      const url = resourceExternalUrl(catalog, r);
      const h = html({ page: 'resource', id: r.id });
      if (!url) {
        expect(h, r.id).not.toContain('data-record-source');
        continue;
      }
      const a = /<a [^>]*data-record-source=""[^>]*>/.exec(h)![0];
      expect(decode(a), r.id).toContain(`href="${url}"`);
    }
  });
  it('the Resources list (both views) and the Sources list (both views) link each upstream directly', () => {
    for (const view of ['cards', 'list']) {
      const res = decode(html({ page: 'resources' }, { [viewKey('resources')]: view }));
      for (const r of catalog.resources) {
        const url = resourceExternalUrl(catalog, r);
        if (url) expect(res, `${view} ${r.id}`).toContain(`href="${url}"`);
      }
      const src = decode(html({ page: 'sources' }, { [viewKey('sources')]: view }));
      for (const x of catalog.sources)
        if (x.upstream) expect(src, `${view} ${x.id}`).toContain(`href="${x.upstream.url}"`);
    }
  });
  it('the Skills list links each skill page, which links its repository: two clicks at most', () => {
    const h = html({ page: 'skills' });
    for (const s of catalog.skills) expect(h, s.id).toContain(`href="/skills/${s.id}"`);
  });
});

describe('ES28.2 detail pages keep the agreed information order', () => {
  it('skill pages: provenance, lifecycle, content availability, then security and evidence, then technical details', () => {
    for (const s of catalog.skills) {
      const h = html({ page: 'skill', id: s.id });
      const at = (m: string) => h.indexOf(m);
      const order = [
        'id="provenance-h"',
        'id="lifecycle-h"',
        'id="content-h"',
        'id="security-evidence"',
        'id="review-h"',
        'id="status-h"',
        'id="evidence-h"',
        'id="technical"',
        'id="consumers-h"',
      ].map(at);
      expect(
        order.every((i) => i > 0),
        s.id,
      ).toBe(true);
      expect(
        [...order].sort((a, b) => a - b),
        s.id,
      ).toEqual(order);
      if (s.discovery) expect(at('id="discovery-h"')).toBeLessThan(at('id="status-h"'));
      // every "On this page" link points at an element that exists
      const nav = h.slice(h.indexOf('aria-label="On this page"'));
      for (const m of nav.slice(0, nav.indexOf('</nav>')).matchAll(/href="#([\w-]+)"/g))
        expect(h, `${s.id} #${m[1]}`).toContain(`id="${m[1]}"`);
    }
  });
  it('partial audits stay visibly incomplete on skill and resource pages', () => {
    for (const s of catalog.skills.filter((x) => x.review.audit?.completeness === 'partial'))
      expect(text(html({ page: 'skill', id: s.id })), s.id).toContain('Review incomplete');
    for (const r of catalog.resources.filter((x) => x.security.audit?.completeness === 'partial'))
      expect(text(html({ page: 'resource', id: r.id })), r.id).toContain('Review incomplete');
  });
});

describe('ES28.2 resources are not skills, and nothing connects', () => {
  it('no MCP endpoint is ever a link, on the list or on a detail page', () => {
    const list =
      decode(html({ page: 'resources' })) +
      decode(html({ page: 'resources' }, { [viewKey('resources')]: 'list' }));
    for (const r of catalog.resources.filter((x) => x.mcp?.officialEndpoint)) {
      const ep = r.mcp!.officialEndpoint!;
      const detail = decode(html({ page: 'resource', id: r.id }));
      expect(detail, r.id).toContain(ep); // shown, as plain text
      expect(detail + list, r.id).not.toContain(`href="${ep}"`);
    }
  });
  it('resource pages show no skill review, approval, assignment or agent-evidence states', () => {
    for (const r of catalog.resources) {
      const t = text(html({ page: 'resource', id: r.id }));
      for (const w of ['Candidate ·', 'Approved by', 'Assigned to', 'Explicit run', 'Lifecycle'])
        expect(t, `${r.id}: ${w}`).not.toContain(w);
    }
  });
});

describe('ES28.2 one frame whatever the status', () => {
  const frames = (h: string, open: RegExp) => new Set([...h.matchAll(open)].map((m) => m[1]));
  it('resource cards share one frame across review states and categories', () => {
    const h = html({ page: 'resources' });
    const set = frames(h, /<li class="relative flex min-w-0"><div class="([^"]+)"/g);
    expect(set.size).toBe(1);
    expect([...set][0]).toContain('cw-item');
  });
  it('source cards share one frame across decisions', () => {
    const h = html({ page: 'sources' });
    const set = frames(h, /<li id="[^"]+" class="flex min-w-0 scroll-mt-24"><div class="([^"]+)"/g);
    expect(new Set(catalog.sources.map((x) => x.decision)).size).toBeGreaterThan(2);
    expect(set.size).toBe(1);
  });
  it('skill cards still share one frame (re-checked across every stage present)', () => {
    expect(new Set(catalog.skills.map(stage)).size).toBeGreaterThanOrEqual(3);
    const set = frames(
      html({ page: 'skills' }),
      /<li class="relative flex min-w-0"><div class="([^"]+)"/g,
    );
    expect(set.size).toBe(1);
  });
});

describe('ES28.2 design-system migration', () => {
  it('no page renders the removed indigo/violet/fuchsia palette (the ES28 bridge is gone)', () => {
    const routes: Route[] = [
      { page: 'home' },
      { page: 'dashboard' },
      { page: 'skills' },
      { page: 'resources' },
      { page: 'sources' },
      { page: 'consumers' },
      { page: 'integrations' },
      { page: 'ecosystem' },
      { page: 'skill', id: catalog.skills[0]!.id },
      { page: 'resource', id: catalog.resources[0]!.id },
    ];
    for (const r of routes)
      expect(html(r), JSON.stringify(r)).not.toMatch(/\b(indigo|violet|fuchsia)-\d/);
  });
  it('the new poses keep the Archivist: 16 × 24, the same hood and face rows, the same palette', () => {
    for (const [name, g] of Object.entries(POSES)) {
      expect(gridSize(g), name).toEqual({ w: 16, h: 24 });
      for (const y of [0, 1, 2, 3, 4, 5, 6, 18, 19, 20, 21, 22, 23])
        expect(g[y], `${name} row ${y}`).toBe(ARCHIVIST[y]);
      for (const row of g) expect(row, name).toMatch(/^[.ohkerlpgsHKLPGS]+$/);
    }
    expect(Object.keys(POSES).sort()).toEqual(['idle', 'lost', 'offline', 'searching']);
  });
  it('empty results and unknown pages show the lost pose beside their explanation', () => {
    for (const route of [
      { page: 'skills', query: { q: 'zzz-no-match' } },
      { page: 'resources', query: { q: 'zzz-no-match' } },
      { page: 'notfound', path: '/x' },
    ] as Route[]) {
      const h = html(route);
      expect(h, JSON.stringify(route)).toMatch(
        /<svg aria-hidden="true" focusable="false"[^>]*cw-px/,
      );
      expect(text(h)).toMatch(/No skills match|No resources match|There is no page/);
      // the lost pose specifically: its map is the only Archivist art drawn with the signal colour (row 14)
      expect(h, JSON.stringify(route)).toMatch(/y="14"[^>]*fill="var\(--px-s\)"/);
    }
  });
});
