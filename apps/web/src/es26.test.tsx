import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  RESOURCE_CATEGORIES as SCHEMA_CATEGORIES,
  RESOURCE_TYPES,
  loadRegistry,
  type Catalog,
} from '@ecosystem-skills/catalog';
import { publicFiles, serviceWorker, webManifest } from '../catalog-plugin.ts';
import { App, NAV, navPageOf, Page } from './App.tsx';
import { I18nProvider } from './i18n.tsx';
import {
  filterResources,
  filterSources,
  parseRoute,
  RESOURCE_CATEGORIES,
  RESOURCE_TYPE_LABEL,
  resourceExternalUrl,
  resourceHref,
} from './lib.ts';
import { readView, viewKey } from './view.tsx';

/*
 * ES26 website: Resources, the Sources Cards/List view, Source-first skill pages, navigation, AI-readable files and
 * the PWA files. Rendered from the real registry (server rendering, as the other page tests).
 */
const repo = resolve(__dirname, '../../..');
const catalog: Catalog = loadRegistry(repo).catalog;
const text = (s: string) =>
  s
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
/** Renders with a fake localStorage holding `store` (language, view preferences). */
const html = (route: Parameters<typeof Page>[0]['route'], store: Record<string, string> = {}) => {
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
const page = (route: Parameters<typeof Page>[0]['route'], store?: Record<string, string>) =>
  text(html(route, store));

describe('ES26 routes and navigation', () => {
  it('resources have a list route with URL filters and a canonical detail route', () => {
    expect(parseRoute('/resources')).toEqual({ page: 'resources' });
    expect(parseRoute('/resources?category=mcp-servers&q=spec')).toEqual({
      page: 'resources',
      query: { category: 'mcp-servers', q: 'spec' },
    });
    expect(parseRoute('/resources/spec-kit')).toEqual({ page: 'resource', id: 'spec-kit' });
    expect(parseRoute('/resources/spec-kit/x')).toMatchObject({ page: 'notfound' });
    expect(resourceHref('spec-kit')).toBe('/resources/spec-kit');
  });

  it('the nav has no Home or Help & Contact, adds Resources, and detail pages mark their list page', () => {
    const labels = NAV.map((n) => n.label);
    expect(labels).toEqual([
      'Overview',
      'Skills',
      'Resources',
      'Sources',
      'FM Ecosystem',
      'Consumers',
      'Agents & tools',
    ]);
    expect(navPageOf({ page: 'resource', id: 'x' })).toBe('resources');
    expect(navPageOf({ page: 'skill', id: 'x' })).toBe('skills');
  });

  it('the header: brand links home, one desktop nav, an accessible menu button, language and theme controls', () => {
    const g = globalThis as Record<string, unknown>;
    g.document = { documentElement: { classList: { contains: () => false, toggle() {} } } };
    g.location = { pathname: '/resources', search: '', hash: '' };
    try {
      const shell = renderToString(<App />);
      const header = shell.slice(shell.indexOf('<header'), shell.indexOf('</header>'));
      expect(header).toMatch(/<a href="\/" aria-label="Ecosystem Skills home"/);
      expect(header).toContain('aria-controls="site-menu"');
      expect(header).toContain('aria-expanded="false"');
      expect(header).toMatch(/id="site-menu"[^>]*hidden=""/);
      expect(header).toContain('aria-label="Switch to dark theme"');
      expect(header).not.toContain('support.fikrimarzuki.work');
      for (const n of NAV) expect(header).toContain(`href="${n.path}"`);
      // ES26.2: the footer keeps only the secondary destinations; the primary pages live in the navbar alone
      const footer = shell.slice(shell.indexOf('<footer'));
      for (const h of [
        'https://support.fikrimarzuki.work',
        'https://fikrimarzuki.work',
        'https://github.com/Fikrimarzuki/ecosystem-skills',
      ])
        expect(footer).toContain(`href="${h}"`);
      for (const n of NAV) expect(footer).not.toContain(`href="${n.path}"`);
      expect(footer).toContain(
        'AI-agent skills, MCP servers, agent toolkits, references, and related resources.',
      );
      expect(footer).toContain('Nothing is installed or run from this site.');
    } finally {
      delete g.document;
      delete g.location;
    }
  });
});

describe('ES26 Resources page', () => {
  it('lists every category, keeps Other developer resources last and separate, and says nothing is installable', () => {
    const t = page({ page: 'resources' });
    expect(t).toContain(`${catalog.resources.length} of ${catalog.resources.length} resources`);
    expect(t).toContain('this site never connects to an MCP server');
    const order = [
      'MCP servers',
      'Agent toolkits',
      'Agent development tools',
      'Agent references',
      'Other developer resources',
    ].map((h) => t.lastIndexOf(h));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html({ page: 'resources' })).toContain('border-dashed border-zinc-300 pt-2');
    expect(t).not.toMatch(/\bInstall\b/);
  });

  it('filters come from the URL (category, type, review status, search) and survive a view switch', () => {
    const only = page({ page: 'resources', query: { category: 'developer-resources' } });
    expect(only).toContain('PlayCanvas Engine');
    expect(only).not.toContain('Spec Kit');
    for (const view of ['cards', 'list']) {
      const t = page(
        { page: 'resources', query: { q: 'shader' } },
        { [viewKey('resources')]: view },
      );
      expect(t, view).toContain('twigl');
      expect(t, view).toContain('1 of');
    }
    expect(
      filterResources(catalog, { security: 'notes-recorded' }).every(
        (r) => r.security.concerns.length,
      ),
    ).toBe(true);
    expect(
      filterResources(catalog, { type: 'mcp-server' }).every((r) => r.category === 'mcp-servers'),
    ).toBe(true);
    const none = page({ page: 'resources', query: { q: 'zzz-no-match' } });
    expect(none).toContain('No resources match these filters');
    expect(none).toContain('Clear filters');
  });

  it('List view is a labelled, stacked-on-mobile list with status and original source links', () => {
    const h = html({ page: 'resources' }, { [viewKey('resources')]: 'list' });
    expect(h).toContain('aria-pressed="true"');
    expect(h).toMatch(/md:grid md:grid-cols-/);
    expect(text(h)).toContain('Original source');
    expect(h).not.toMatch(/overflow-x-auto/);
  });

  it('a detail page shows provenance first, then security notes, then MCP details; nothing connects', () => {
    const t = page({ page: 'resource', id: 'appllama-mcp' });
    const p = t.indexOf('Source and provenance'),
      s = t.indexOf('Security notes'),
      m = t.indexOf('MCP server details');
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(s);
    expect(s).toBeLessThan(m);
    expect(t).toContain('Official endpoint (not connected)');
    expect(t).toContain('https://mcp.appllama.io/mcp');
    expect(t).toContain('Proprietary hosted service'); // not the MIT licence of the client-config repository
    expect(html({ page: 'resource', id: 'appllama-mcp' })).not.toContain(
      'href="https://mcp.appllama.io/mcp"',
    );
    expect(page({ page: 'resource', id: 'twigl' })).toContain('not an AI-agent capability');
    expect(page({ page: 'resource', id: 'nope' })).toContain('No resource with id “nope”');
  });

  it('Indonesian renders the page chrome in Indonesian', () => {
    const t = page({ page: 'resources' }, { lang: 'id' });
    expect(t).toContain('Sumber Daya');
    expect(t).toContain('Sumber daya pengembang lainnya');
  });

  it('web labels cover exactly the catalog enums', () => {
    expect([...RESOURCE_CATEGORIES].sort()).toEqual([...SCHEMA_CATEGORIES].sort());
    expect(Object.keys(RESOURCE_TYPE_LABEL).sort()).toEqual([...RESOURCE_TYPES].sort());
  });
});

describe('ES26 Sources Cards/List', () => {
  it('defaults to Cards and remembers List per page; unknown stored values fall back to Cards', () => {
    const store = (v: string | null) => ({ getItem: () => v });
    expect(readView(store(null), 'sources')).toBe('cards');
    expect(readView(store('list'), 'sources')).toBe('list');
    expect(readView(store('grid'), 'sources')).toBe('cards');
    expect(
      readView(
        {
          getItem: () => {
            throw new Error('blocked');
          },
        },
        'sources',
      ),
    ).toBe('cards');
    expect(viewKey('sources')).not.toBe(viewKey('resources'));
  });

  it('List view keeps warnings visible and shows the requested columns', () => {
    const h = html({ page: 'sources' }, { [viewKey('sources')]: 'list' });
    const t = text(h);
    for (const col of [
      'Source',
      'Type',
      'Publisher',
      'Discovery status',
      'Last verified',
      'Actions',
    ])
      expect(t).toContain(col);
    const warned = catalog.sources.filter((s) => s.warnings.length).length;
    expect((t.match(/⚠ \d+ warnings?/g) ?? []).length).toBe(warned);
    // Not only the count: every warning's text is in the list, behind a labelled disclosure per source.
    expect((h.match(/<details/g) ?? []).length).toBe(warned);
    const gstack = catalog.sources.find((s) => s.id === 'garrytan-gstack')!;
    expect(t).toContain(`Show warnings for ${gstack.name}`);
    for (const w of catalog.sources.flatMap((s) => s.warnings)) expect(t).toContain(text(w).trim());
    expect(page({ page: 'sources' })).toContain('Catalogued resources');
  });

  it('search covers the new ES26 sources', () => {
    expect(filterSources(catalog, { q: 'playcanvas' }).map((s) => s.id)).toEqual([
      'playcanvas-engine',
    ]);
    expect(filterSources(catalog, { kind: 'developer-resource' }).length).toBeGreaterThanOrEqual(5);
  });
});

describe('ES26 skill detail: Source before Lifecycle', () => {
  it('orders header, provenance, lifecycle, content availability, review', () => {
    for (const id of ['antislop', 'caveman']) {
      const h = html({ page: 'skill', id });
      const i = ['id="provenance-h"', 'id="lifecycle-h"', 'id="content', 'id="review-h"'].map((x) =>
        h.indexOf(x),
      );
      expect(
        i.every((x) => x > 0),
        id,
      ).toBe(true);
      expect(
        [...i].sort((a, b) => a - b),
        id,
      ).toEqual(i);
    }
    const t = page({ page: 'skill', id: 'antislop' });
    expect(t).toContain('Maintainer');
    expect(t).toContain('miqdadbadjuber/anti-slop');
    expect(page({ page: 'skill', id: 'antislop-human' })).toContain('Anti-Slop contrast MCP');
  });
});

describe('ES26 public files and PWA', () => {
  const files = publicFiles(repo, 'https://skills.example.test', '/');
  it('emits catalog, llms.txt, the resource export and a manifest from the public registry only', () => {
    expect(Object.keys(files).sort()).toEqual([
      'catalog.json',
      'llms.txt',
      'manifest.webmanifest',
      'resources.v1.json',
    ]);
    const all = Object.values(files).join('\n');
    expect(all).not.toMatch(/\/(Users|home|private|var|tmp)\//);
    expect(all).not.toMatch(/registry\/access\.json|PRIVATE_ROOT|ECOSYSTEM_SKILLS_PRIVATE/);
  });

  it('the manifest is installable and follows the deployment base', () => {
    const m = JSON.parse(webManifest('/ecosystem-skills/'));
    expect(m).toMatchObject({
      display: 'standalone',
      start_url: '/ecosystem-skills/',
      scope: '/ecosystem-skills/',
    });
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
    expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });

  it('the service worker caches only same-origin GETs, falls back to the app shell, and marks offline data', () => {
    const sw = serviceWorker('/', ['index.html', 'assets/a.js']);
    expect(sw).toContain("request.method !== 'GET' || url.origin !== self.location.origin");
    expect(sw).toContain("networkFirst(request, BASE + 'index.html')");
    expect(sw).toContain('X-Ecosystem-Skills-Offline');
    expect(serviceWorker('/', ['index.html'])).not.toEqual(sw); // a new build gets a new cache name
  });
});

describe('ES26.2 Resources sidebar, card links and footer', () => {
  it('the sidebar lists All plus five categories with total (unfiltered) counts, the active one marked, filters kept in links', () => {
    const h = html({
      page: 'resources',
      query: { category: 'mcp-servers', q: 'mcp', security: 'notes-recorded' },
    });
    const nav = h.slice(h.indexOf('aria-label="Resource categories"'), h.indexOf('</nav>'));
    expect((nav.match(/<li/g) ?? []).length).toBe(6);
    const mcp = catalog.resources.filter((r) => r.category === 'mcp-servers').length;
    expect(text(nav)).toContain(`MCP servers ${mcp} resources ${mcp}`);
    expect(text(nav)).toContain(`All resources ${catalog.resources.length} resources`);
    expect((nav.match(/aria-current="page"/g) ?? []).length).toBe(1);
    // switching category keeps search and review status, and drops nothing else
    expect(nav).toMatch(
      /href="\/resources\?q=mcp&amp;category=agent-toolkits&amp;security=notes-recorded"|href="\/resources\?[^"]*category=agent-toolkits[^"]*q=mcp/,
    );
    // Other developer resources is set apart from the agent categories
    expect(nav).toContain('border-dashed');
    // one category control per breakpoint: sidebar (wide) and selector (narrow), none in the page header
    expect((h.match(/aria-label="Resources by category"/g) ?? []).length).toBe(0);
  });

  it('a filter combination with no match offers to clear the filters inside the category', () => {
    const t = page({
      page: 'resources',
      query: { category: 'mcp-servers', q: 'zzz-no-such-resource' },
    });
    expect(t).toContain('No resources match these filters');
    expect(t).toContain('Clear search and filters');
    expect(t).toContain('Show all categories');
    expect(t).toContain(
      `0 of ${catalog.resources.filter((r) => r.category === 'mcp-servers').length} resources in MCP servers`,
    );
  });

  it('cards link to the verified upstream with an accessible name, never to an MCP endpoint, and omit it without a URL', () => {
    const h = html({ page: 'resources' });
    const n = catalog.resources.filter((r) => resourceExternalUrl(catalog, r)).length;
    expect(n).toBe(catalog.resources.length);
    expect((h.match(/title="Original source of /g) ?? []).length).toBe(n);
    expect(h).toMatch(/target="_blank" rel="noreferrer noopener"/);
    // no nested interactive elements: the icon link is never inside the title link
    expect(h).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<a /);
    for (const r of catalog.resources) {
      const u = resourceExternalUrl(catalog, r)!;
      expect(u.startsWith('https://')).toBe(true);
      if (r.mcp?.officialEndpoint) expect(u).not.toBe(r.mcp.officialEndpoint);
    }
    // missing / unverified source: no icon
    const bare: Catalog = {
      ...catalog,
      sources: catalog.sources.map((s) => ({ ...s, upstream: undefined })),
    };
    const r = catalog.resources.find((x) => !x.homepage)!;
    expect(resourceExternalUrl(bare, r)).toBeUndefined();
    // a homepage-only resource still gets its official website, but an http URL never does
    const appllama = catalog.resources.find((x) => x.id === 'appllama-mcp')!;
    expect(resourceExternalUrl(bare, appllama)).toBe(appllama.homepage);
    expect(
      resourceExternalUrl(bare, { ...appllama, homepage: 'http://insecure.example' }),
    ).toBeUndefined();
    // an MCP connection endpoint is never offered as a documentation link, even if it were the homepage
    const endpoint = 'https://mcp.example.com/mcp';
    const withEndpoint = {
      ...appllama,
      homepage: endpoint,
      mcp: { ...appllama.mcp!, officialEndpoint: endpoint },
    };
    expect(resourceExternalUrl(bare, withEndpoint)).toBeUndefined();
  });
});
