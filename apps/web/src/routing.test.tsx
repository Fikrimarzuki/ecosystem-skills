import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCatalog, type Catalog } from '@ecosystem-skills/catalog';
import { App, NAV, Page } from './App.tsx';
import { filterSkills, parseRoute, skillHref, skillsHref, type Route } from './lib.ts';

const root = resolve(__dirname, '../../..');
const read = (n: string) =>
  JSON.parse(readFileSync(join(root, 'registry', `${n}.json`), 'utf8')) as unknown;
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
    .replace(/\s+/g, ' ');
const html = (route: Route) => renderToString(<Page route={route} catalog={catalog} />);

describe('route parsing (clean URLs)', () => {
  it.each([
    ['/', { page: 'home' }],
    ['', { page: 'home' }],
    ['/overview', { page: 'dashboard' }],
    ['/skills', { page: 'skills' }],
    ['/skills/', { page: 'skills' }], // a trailing slash is ignored
    ['/consumers', { page: 'consumers' }],
    ['/integrations', { page: 'integrations' }],
    ['/skills/caveman', { page: 'skill', id: 'caveman' }],
    ['/skills/a%20b', { page: 'skill', id: 'a b' }],
  ] as [string, Route][])('%s', (url, route) => expect(parseRoute(url)).toEqual(route));

  it('anything else is not found, including extra segments and malformed escapes', () => {
    for (const u of [
      '/nope',
      '/skills/a/b',
      '/overview/x',
      '/consumers/1',
      '/skills/%E0%A4%A',
      '/index.html',
      '/#/skills',
    ])
      expect(parseRoute(u).page, u).toBe('notfound');
    expect(parseRoute('/nope')).toEqual({ page: 'notfound', path: '/nope' });
  });

  it('query parameters belong to the Skills page and are never read as path segments', () => {
    expect(parseRoute('/skills?group=Design')).toEqual({
      page: 'skills',
      query: { group: 'Design' },
    });
    expect(parseRoute('/skills?status=approved&origin=external&q=plan')).toEqual({
      page: 'skills',
      query: { status: 'approved', origin: 'external', q: 'plan' },
    });
    expect(parseRoute('/overview?group=Design')).toEqual({ page: 'dashboard' }); // ignored, not an error
    expect(parseRoute('/?x=/skills')).toEqual({ page: 'home' });
    expect(skillHref('a b')).toBe('/skills/a%20b');
    expect(skillsHref({ group: 'Design', q: 'a b' })).toBe('/skills?group=Design&q=a+b');
  });
});

describe('rendering every route', () => {
  it('renders each page, and unknown URLs show a not-found page with a way out', () => {
    expect(text(html({ page: 'home' }))).toContain(
      'One place to manage the skills your AI agents use',
    );
    expect(text(html({ page: 'dashboard' }))).toContain('Third-party review status');
    expect(text(html({ page: 'skills' }))).toContain(
      `${catalog.skills.length} of ${catalog.skills.length} skills`,
    );
    expect(text(html({ page: 'consumers' }))).toContain('With assigned skills');
    expect(text(html({ page: 'integrations' }))).toContain('Agent compatibility');
    expect(text(html({ page: 'skill', id: 'caveman' }))).toContain('Lifecycle');
    expect(text(html({ page: 'skill', id: 'nope' }))).toContain('Skill not found');
    const nf = html({ page: 'notfound', path: '/nowhere' });
    expect(text(nf)).toContain('Page not found');
    expect(text(nf)).toContain('There is no page at “/nowhere”.');
    expect(nf).toContain('href="/"');
    expect(nf).toContain('href="/skills"');
  });

  it('every internal link on every page is a clean path, never a #/ hash route', () => {
    const routes: Route[] = [
      { page: 'home' },
      { page: 'dashboard' },
      { page: 'skills' },
      { page: 'consumers' },
      { page: 'integrations' },
      { page: 'sources' },
      { page: 'notfound', path: '/x' },
      ...catalog.skills.map((s) => ({ page: 'skill', id: s.id }) as Route),
    ];
    for (const r of routes) {
      const out = html(r);
      expect(out, JSON.stringify(r)).not.toMatch(/href="#\//);
      for (const m of out.matchAll(/href="(\/[^"]*)"/g))
        expect(m[1], m[1]).toMatch(
          /^\/(skills|overview|consumers|integrations|sources)?(\/[^/]+)?(\?.*)?(#.*)?$/,
        );
    }
    // The shell (header, mobile nav, footer) too, with the active page marked.
    const g = globalThis as Record<string, unknown>;
    g.document = { documentElement: { classList: { contains: () => false, toggle() {} } } };
    g.location = { pathname: '/skills/caveman', search: '', hash: '' };
    try {
      const shell = renderToString(<App />);
      expect(shell).not.toMatch(/href="#\/(?!")/);
      for (const n of NAV) expect(shell).toContain(`href="${n.path}"`);
      // Exactly the Skills links (bar and compact nav) are marked current, because /skills/caveman is a skill page.
      const current = [...shell.matchAll(/<a [^>]*aria-current="page"[^>]*>/g)].map((m) => m[0]);
      expect(current).toHaveLength(2);
      for (const a of current) expect(a).toContain('href="/skills"');
      expect(text(shell)).toContain('Loading catalog…'); // not the landing page: the URL chose a catalog page
    } finally {
      delete g.document;
      delete g.location;
    }
  });

  it('opening a filtered URL restores the filters, and unknown parameters are ignored', () => {
    const planning = text(html({ page: 'skills', query: { group: 'Planning' } }));
    expect(planning).toContain(
      `${filterSkills(catalog, { group: 'Planning' }).length} of ${catalog.skills.length} skills`,
    );
    expect(planning).toContain('Clear filters');
    const both = text(html({ page: 'skills', query: { group: 'Planning', status: 'approved' } }));
    expect(both).toContain(
      `${filterSkills(catalog, { group: 'Planning', status: 'approved' }).length} of ${catalog.skills.length} skills`,
    );
    expect(text(html({ page: 'skills', query: { utm_source: 'x' } }))).toContain(
      `${catalog.skills.length} of ${catalog.skills.length} skills`,
    );
    expect(text(html({ page: 'skills', query: { q: 'zzzz' } }))).toContain(
      'No skills match these filters',
    );
  });
});

/** A small fake browser: location, a history stack with Back/Forward, and event dispatch. */
function fakeBrowser(start: string) {
  const ORIGIN = 'https://example.test';
  const stack = [start];
  let i = 0;
  const loc = { pathname: '', search: '', hash: '', origin: ORIGIN, href: '' };
  const apply = (u: string) => {
    const url = new URL(u, ORIGIN);
    Object.assign(loc, {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      href: url.href,
    });
  };
  apply(start);
  const handlers: Record<string, ((e?: unknown) => void)[]> = {};
  const fire = (name: string, e?: unknown) => (handlers[name] ?? []).forEach((h) => h(e));
  const scrollTo = vi.fn();
  const focus = vi.fn();
  const g = globalThis as Record<string, unknown>;
  g.location = loc;
  g.history = {
    pushState: (_s: unknown, _t: string, u: string) => {
      stack.splice(i + 1);
      stack.push(u);
      i++;
      apply(u);
    },
    replaceState: (_s: unknown, _t: string, u: string) => {
      stack[i] = u;
      apply(u);
    },
  };
  g.window = {
    addEventListener: (n: string, f: () => void) => (handlers[n] ??= []).push(f),
    scrollTo,
  };
  g.document = {
    addEventListener: (n: string, f: () => void) => (handlers[`doc:${n}`] ??= []).push(f),
    getElementById: () => ({ focus }),
  };
  return {
    loc,
    stack: () => [...stack],
    index: () => i,
    scrollTo,
    focus,
    back() {
      i--;
      apply(stack[i]!);
      fire('popstate');
    },
    forward() {
      i++;
      apply(stack[i]!);
      fire('popstate');
    },
    setHash(h: string) {
      loc.hash = h;
      fire('hashchange');
    },
    click(a: unknown, mods: Record<string, unknown> = {}) {
      const e = {
        defaultPrevented: false,
        button: 0,
        target: { closest: () => a },
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...mods,
      };
      (handlers['doc:click'] ?? []).forEach((h) => h(e));
      return e;
    },
    anchor: (href: string, extra: Record<string, unknown> = {}) => ({
      getAttribute: () => href,
      hasAttribute: () => false,
      href: new URL(href, ORIGIN).href,
      target: '',
      ...extra,
    }),
  };
}

describe('router (History API) in a fake browser', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllEnvs();
    const g = globalThis as Record<string, unknown>;
    for (const k of ['location', 'history', 'window', 'document']) delete g[k];
  });
  const load = async () => import('./router.ts');

  it('legacy hash URLs become clean URLs in place, keeping query parameters', async () => {
    const cases: [string, string][] = [
      ['/#/', '/'],
      ['/#/overview', '/overview'],
      ['/#/skills', '/skills'],
      ['/#/consumers', '/consumers'],
      ['/#/integrations', '/integrations'],
      ['/#/skills/caveman', '/skills/caveman'],
      ['/#/skills?status=approved&origin=external', '/skills?status=approved&origin=external'],
      ['/#/skills/', '/skills'],
      ['/?utm=1#/skills?group=Design', '/skills?utm=1&group=Design'], // real query kept, fragment query added
      ['/?group=Coding#/skills?group=Design', '/skills?group=Design'], // the old bookmark's own value wins
    ];
    for (const [from, to] of cases) {
      vi.resetModules();
      const b = fakeBrowser(from);
      const r = await load();
      expect(r.normalizeLegacyUrl(), from).toBe(true);
      expect(`${b.loc.pathname}${b.loc.search}`, from).toBe(to);
      expect(b.loc.hash, from).toBe(''); // fragment gone: converting again does nothing (no redirect loop)
      expect(r.normalizeLegacyUrl(), from).toBe(false);
      expect(b.stack(), from).toHaveLength(1); // replaceState: no extra history entry, Back leaves the site as before
    }
  });

  it('ordinary fragments and unknown old routes are not treated as routes', async () => {
    for (const from of [
      '/',
      '/#main',
      '/skills#details',
      '/#section',
      '/#/nonsense',
      '/#/skills/a/b',
      '/#/overview/x',
      '/#nothing/',
    ]) {
      vi.resetModules();
      const b = fakeBrowser(from);
      const r = await load();
      expect(r.normalizeLegacyUrl(), from).toBe(false);
      expect(b.stack(), from).toEqual([from]); // untouched
    }
  });

  it('an old link opened while the app is running is converted and the page updates', async () => {
    const b = fakeBrowser('/overview');
    const r = await load();
    const seen: string[] = [];
    r.subscribe(() => seen.push(r.currentUrl()));
    b.setHash('#/skills/caveman');
    expect(seen).toEqual(['/skills/caveman']);
    expect(b.loc.hash).toBe('');
    b.setHash('#main'); // a plain fragment is ignored
    expect(seen).toHaveLength(1);
  });

  it('navigation adds history entries; Back and Forward restore pages; same URL is a no-op', async () => {
    const b = fakeBrowser('/');
    const r = await load();
    const seen: string[] = [];
    r.subscribe(() => seen.push(r.currentUrl()));
    r.navigate('/skills');
    r.navigate('/skills/caveman');
    r.navigate('/skills/caveman'); // already there
    expect(b.stack()).toEqual(['/', '/skills', '/skills/caveman']);
    expect(seen).toEqual(['/skills', '/skills/caveman']);
    b.back();
    expect(r.currentUrl()).toBe('/skills');
    b.back();
    expect(r.currentUrl()).toBe('/');
    b.forward();
    expect(r.currentUrl()).toBe('/skills');
    expect(seen.at(-1)).toBe('/skills'); // subscribers hear Back/Forward
    r.navigate('/consumers'); // navigating after Back drops the forward entries, like a real browser
    expect(b.stack()).toEqual(['/', '/skills', '/consumers']);
    // A new page starts at the top and takes focus; the same page does not scroll.
    expect(b.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(b.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('filters: choosing one adds a history entry, typing replaces it, Back restores the previous filter state', async () => {
    const b = fakeBrowser('/skills');
    const r = await load();
    r.subscribe(() => {});
    r.navigate('/skills?status=approved'); // chose a status
    r.navigate('/skills?status=approved&group=Planning'); // chose a category
    r.navigate('/skills?status=approved&group=Planning&q=g', { replace: true }); // typing
    r.navigate('/skills?status=approved&group=Planning&q=gr', { replace: true });
    expect(b.stack()).toEqual([
      '/skills',
      '/skills?status=approved',
      '/skills?status=approved&group=Planning&q=gr',
    ]);
    b.back();
    expect(parseRoute(r.currentUrl())).toEqual({ page: 'skills', query: { status: 'approved' } });
    b.back();
    expect(parseRoute(r.currentUrl())).toEqual({ page: 'skills' }); // filters cleared
    b.forward();
    b.forward();
    expect(parseRoute(r.currentUrl())).toEqual({
      page: 'skills',
      query: { status: 'approved', group: 'Planning', q: 'gr' },
    });
    expect(b.scrollTo).not.toHaveBeenCalled(); // filter changes stay on the same page: no jump to the top
    r.navigate('/skills'); // "Clear filters"
    expect(b.stack().at(-1)).toBe('/skills');
  });

  it('clicks on ordinary internal links navigate without a reload; everything else keeps native behaviour', async () => {
    const b = fakeBrowser('/');
    const r = await load();
    r.subscribe(() => {});
    const e = b.click(b.anchor('/skills/caveman'));
    expect(e.defaultPrevented).toBe(true); // handled by the app: no full page load
    expect(r.currentUrl()).toBe('/skills/caveman');
    const native = [
      b.click(b.anchor('https://support.fikrimarzuki.work')), // other origin
      b.click(b.anchor('/overview', { target: '_blank' })), // new tab
      b.click(b.anchor('#main')), // in-page anchor (skip link)
      b.click(b.anchor('/overview'), { metaKey: true }), // open in new tab
      b.click(b.anchor('/overview'), { ctrlKey: true }),
      b.click(b.anchor('/overview'), { shiftKey: true }),
      b.click(b.anchor('/overview'), { button: 1 }), // middle click
      b.click(b.anchor('/overview', { hasAttribute: (n: string) => n === 'download' })),
    ];
    for (const ev of native) expect(ev.defaultPrevented).toBe(false);
    expect(r.currentUrl()).toBe('/skills/caveman'); // none of those navigated
    expect(b.click(null).defaultPrevented).toBe(false); // click not on a link
  });

  it('works under a deployment base path such as /ecosystem-skills/', async () => {
    vi.stubEnv('BASE_URL', '/ecosystem-skills/');
    const b = fakeBrowser('/ecosystem-skills/skills/caveman?x=1');
    const r = await load();
    expect(r.BASE).toBe('/ecosystem-skills');
    expect(r.href('/')).toBe('/ecosystem-skills/');
    expect(r.href('/skills?q=a')).toBe('/ecosystem-skills/skills?q=a');
    expect(r.currentUrl()).toBe('/skills/caveman?x=1');
    expect(r.stripBase('/ecosystem-skills')).toBe('/');
    expect(r.stripBase('/other/skills')).toBeUndefined();
    r.subscribe(() => {});
    r.navigate('/overview');
    expect(b.loc.pathname).toBe('/ecosystem-skills/overview');
    expect(b.click(b.anchor('/other/place')).defaultPrevented).toBe(false); // outside the base: not ours
    expect(b.click(b.anchor('/ecosystem-skills/consumers')).defaultPrevented).toBe(true);
    expect(r.currentUrl()).toBe('/consumers');
  });
});

describe('static assets and the Vercel SPA fallback', () => {
  const cfg = JSON.parse(readFileSync(join(__dirname, '../vercel.json'), 'utf8')) as {
    rewrites: { source: string; destination: string }[];
    framework: string;
    outputDirectory: string;
    buildCommand: string;
  };
  // Vercel serves real files first and applies a rewrite only when no file matches; this checks which paths the
  // pattern can ever send to index.html. (It models the pattern, not Vercel's matcher itself.)
  const rewrites = (p: string) => {
    const [rule] = cfg.rewrites;
    return new RegExp(`^/${rule!.source.slice(2, -1)}$`).test(p);
  };

  it('sends application routes (and refreshes of deep links) to index.html', () => {
    expect(cfg.rewrites).toHaveLength(1);
    expect(cfg.rewrites[0]!.destination).toBe('/index.html');
    for (const p of [
      '/',
      '/overview',
      '/skills',
      '/consumers',
      '/integrations',
      '/skills/caveman',
      '/not/a/page',
    ])
      expect(rewrites(p), p).toBe(true);
  });

  it('never rewrites the catalog, hashed assets or other files, so a missing asset is a real 404, not HTML', () => {
    for (const p of [
      '/catalog.json',
      '/assets/index-abc123.js',
      '/assets/index-abc123.css',
      '/assets/missing.js',
      '/favicon.ico',
      '/robots.txt',
    ])
      expect(rewrites(p), p).toBe(false);
  });

  it('keeps the existing project settings', () => {
    expect(cfg.framework).toBe('vite');
    expect(cfg.outputDirectory).toBe('dist');
    expect(cfg.buildCommand).toBe('pnpm run build');
  });
});
