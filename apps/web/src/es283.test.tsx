import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadRegistry, type Catalog } from '@ecosystem-skills/catalog';
import { Page } from './App.tsx';
import { GLYPHS, gridSize } from './art.tsx';
import { I18nProvider } from './i18n.tsx';
import { agentName, agentOverview, consumerAnchor, ecosystemSkills } from './lib.ts';
import { REPO_URL } from './links.ts';
import { viewKey } from './view.tsx';

/*
 * ES28.3 checks for the last four Command Window pages (Overview, Consumers, Agents & tools, FM Ecosystem) and the
 * cross-page fixes (ledger tables, glyph slots, filter labels), rendered from the real registry.
 */
const repo = resolve(__dirname, '../../..');
const catalog: Catalog = loadRegistry(repo).catalog;
type Route = Parameters<typeof Page>[0]['route'];
const html = (route: Route, store: Record<string, string> = {}, c: Catalog = catalog) => {
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: () => {},
  } as unknown as Storage;
  try {
    return renderToString(
      <I18nProvider>
        <Page route={route} catalog={c} />
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
const levels = (h: string) => [...h.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));

const PAGES: Route[] = [
  { page: 'dashboard' },
  { page: 'consumers' },
  { page: 'integrations' },
  { page: 'ecosystem' },
];

describe('ES28.3 converted pages: shared rules', () => {
  it('each has one h1 (the familiar navigation name), the RPG name above it, and no skipped heading level', () => {
    const names = {
      dashboard: ['Adventurer’s dashboard', 'Overview'],
      consumers: ['Agent builds', 'Consumers'],
      integrations: ['Agent roster', 'Agents & tools'],
      ecosystem: ['Guild registry', 'FM Ecosystem skills'],
    } as const;
    for (const r of PAGES) {
      const h = html(r);
      const l = levels(h);
      expect(
        l.filter((x) => x === 1),
        r.page,
      ).toHaveLength(1);
      l.forEach(
        (x, i) => i && expect(x - l[i - 1]!, `${r.page} heading ${i}`).toBeLessThanOrEqual(1),
      );
      const [kicker, title] = names[r.page as keyof typeof names];
      expect(text(h), r.page).toContain(`${kicker} ${title}`);
      expect(/<h1[^>]*>([^<]*)<\/h1>/.exec(h)![1]!.replace(/&amp;/g, '&'), r.page).toBe(title);
    }
  });
  it('all artwork is hidden from assistive technology and never focusable', () => {
    for (const r of PAGES)
      for (const svg of html(r).match(/<svg[^>]*>/g) ?? []) {
        expect(svg, r.page).toContain('aria-hidden="true"');
        expect(svg, r.page).toContain('focusable="false"');
      }
  });
  it('no game-progress wording: security and approval are never levels, XP, rarity, loot or unlocks', () => {
    for (const r of PAGES)
      expect(text(html(r)), r.page).not.toMatch(
        /\b(XP|experience points?|level ?up|rarity|rare|epic|legendary|loot|achievement|unlocked|equipped|power)\b/i,
      );
  });
  it('nothing on them connects or installs: no buttons, forms or MCP endpoint links', () => {
    for (const r of PAGES) {
      const h = decode(html(r));
      expect(h, r.page).not.toMatch(/<form/);
      for (const res of catalog.resources.filter((x) => x.mcp?.officialEndpoint))
        expect(h, r.page).not.toContain(`href="${res.mcp!.officialEndpoint}"`);
    }
  });
  it('every external link opens in a new tab without an opener', () => {
    for (const r of PAGES)
      for (const a of html(r).match(/<a [^>]*href="https?:[^"]*"[^>]*>/g) ?? []) {
        expect(a, r.page).toContain('target="_blank"');
        expect(a, r.page).toMatch(/rel="noreferrer noopener"/);
      }
  });
});

describe('ES28.3 Overview (Adventurer’s dashboard)', () => {
  it('uses titled Command Windows whose titles are real headings', () => {
    const h = html({ page: 'dashboard' });
    for (const id of ['registry', 'origin', 'pipeline', 'agents', 'recent', 'private'])
      expect(h, id).toMatch(new RegExp(`<section id="${id}" aria-labelledby="${id}-h"`));
    expect((h.match(/<h2 id="[a-z]+-h" class="cw-tab">/g) ?? []).length).toBe(6);
  });
  it('every count comes from the catalog (change the catalog, the numbers change)', () => {
    const small: Catalog = {
      ...catalog,
      sources: catalog.sources.slice(0, 7),
      resources: catalog.resources.slice(0, 3),
      consumers: catalog.consumers.slice(0, 5),
    };
    const t = text(html({ page: 'dashboard' }, {}, small));
    expect(t).toMatch(/ 7 Sources /);
    expect(t).toMatch(/ 3 Resources /);
    expect(t).toMatch(/ 5 Consumers /);
    expect(t).toContain(`${catalog.skills.length} Registered skills`);
    expect(t).toMatch(
      new RegExp(
        `FM Ecosystem Part of the first-party count[^0-9]*${ecosystemSkills(catalog).length} `,
      ),
    );
  });
  it('review states are four separate counts linking to the filtered catalog, never a bar or meter', () => {
    const h = html({ page: 'dashboard' });
    for (const s of ['discovered', 'reviewed', 'approved', 'rejected'])
      expect(h).toContain(`href="/skills?status=${s}"`);
    expect(h).not.toMatch(/role="(progressbar|meter)"|<progress|<meter/);
  });
});

describe('ES28.3 Consumers (Agent builds)', () => {
  const h = html({ page: 'consumers' });
  it('every consumer has an anchor, and every assigned one is in the build index', () => {
    for (const c of catalog.consumers) expect(h, c.id).toContain(`id="${consumerAnchor(c.id)}"`);
    for (const c of catalog.consumers.filter((x) => x.assignments.length))
      expect(h, c.id).toContain(`href="#${consumerAnchor(c.id)}"`);
  });
  it('says assignments are desired state, and every build uses the same frame whatever its verification', () => {
    const cards = h.match(/<article class="[^"]*"/g) ?? [];
    expect(cards.length).toBe(catalog.consumers.filter((x) => x.assignments.length).length);
    expect(new Set(cards).size).toBe(1);
    expect(text(h)).toContain('Assigned skills · desired state');
    expect(text(h)).toContain('cannot see a project’s folders');
  });
  it('lists every assignment with its agents, install mode and verification, and no install claim', () => {
    const t = text(h);
    const n = catalog.consumers.reduce((s, c) => s + c.assignments.length, 0);
    expect((t.match(/Agents [^]*? Install (symlink|copy) Verification /g) ?? []).length).toBe(n);
    // the page's own wording; recorded verification notes (registry text, in <details>) may say what a check did
    expect(text(h.replace(/<details[^]*?<\/details>/g, ''))).not.toMatch(
      /\b(installed (in|for|on)|is activated|activated (in|for|on)|equipped|unlocked)\b/i,
    );
  });
});

describe('ES28.3 Agents & tools (Agent roster)', () => {
  const h = html({ page: 'integrations' });
  it('has one roster panel per tested agent, with the four recorded counts, and no invented agent', () => {
    const t = text(h);
    for (const a of agentOverview(catalog)) {
      expect(t).toContain(
        `${agentName(a.agent)} Skills with runs ${a.skillsWithEvidence} Explicit runs verified ${a.explicitSkills} skills Natural: loaded`,
      );
    }
    expect(
      (h.match(/<li class="surface flex min-w-0 flex-col p-4 sm:p-5"><h3/g) ?? []).length,
    ).toBe(agentOverview(catalog).length);
    expect(h).not.toMatch(/<table/);
  });
  it('lists each tool with the skills that require it as links, and never links a private repository', () => {
    for (const i of catalog.integrations) {
      expect(text(h)).toContain(i.name);
      for (const s of catalog.skills.filter((x) => x.requires.includes(i.id)))
        expect(h, `${i.id} ${s.id}`).toContain(`href="/skills/${s.id}"`);
      if (i.repository?.visibility === 'private')
        expect(h).not.toMatch(new RegExp(`href="https?://[^"]*/${i.repository.name}"`));
    }
  });
});

describe('ES28.3 FM Ecosystem (Guild registry)', () => {
  const h = html({ page: 'ecosystem' });
  it('says first that public to read is not public to install', () => {
    const t = text(h);
    const notice = t.indexOf('Public to read does not mean public to install.');
    expect(notice).toBeGreaterThan(0);
    for (const s of ecosystemSkills(catalog)) expect(notice).toBeLessThan(t.indexOf(s.name));
  });
  it('opens each skill’s source folder in the public repository, and each public shared source', () => {
    for (const s of ecosystemSkills(catalog)) {
      if (s.source.type !== 'first-party') continue;
      expect(h, s.id).toContain(`href="${REPO_URL}/tree/main/${s.source.path}"`);
    }
    for (const i of catalog.integrations.filter((x) =>
      ecosystemSkills(catalog).some((s) => s.requires.includes(x.id)),
    ))
      if (i.repository?.url) expect(h, i.id).toContain(`href="${i.repository.url}"`);
      else if (i.repository)
        expect(text(h), i.id).toContain(`${i.repository.name} (private repository; not linked)`);
  });
  it('shows restricted distribution and owner-only access as written in the registry, and no install state', () => {
    const t = text(h);
    expect(t).toContain('Restricted · Owner-only');
    expect(t).not.toMatch(/\bApproved\b|\binstalled for\b|Verified on/);
    expect(t).not.toMatch(/\bunlocked\b|\bequipped\b/i);
  });
});

describe('ES28.3 cross-page fixes', () => {
  it('List views are real tables: a caption, column headers and a row header per item, with phone labels', () => {
    const cases = [
      ['skills', 'view.skills', catalog.skills.length, 2],
      ['resources', 'view.resources', catalog.resources.length, 5],
      ['sources', 'view.sources', catalog.sources.length, 6],
    ] as const;
    for (const [page, key, rows, cols] of cases) {
      const h = html({ page } as Route, { [key]: 'list' });
      expect(h, page).toContain('<table role="table" class="cw-ledger">');
      expect(h, page).toMatch(/<caption class="sr-only">/);
      const tables = (h.match(/<table /g) ?? []).length;
      expect((h.match(/role="columnheader" scope="col"/g) ?? []).length, page).toBe(tables * cols);
      expect((h.match(/<th role="rowheader" scope="row">/g) ?? []).length, page).toBe(rows);
      // every data cell has its column name for the stacked phone layout (except a lone source column)
      expect((h.match(/<td role="cell"/g) ?? []).length, page).toBe(rows * (cols - 1));
      expect(h, page).not.toContain('data-list-head');
    }
  });
  it('glyph slots draw their glyph at 3×, inline glyphs stay 2×', () => {
    const h = html({ page: 'home' });
    for (const m of h.matchAll(
      /<span class="cw-slot[^"]*"><svg [^>]*width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"[^>]*cw-px/g,
    ))
      expect([Number(m[1]), Number(m[2])]).toEqual([Number(m[3]) * 3, Number(m[4]) * 3]);
    const ledger = gridSize(GLYPHS.ledger);
    expect(html({ page: 'dashboard' })).toContain(
      `width="${ledger.w * 2}" height="${ledger.h * 2}"`,
    ); // kicker
  });
  it('the new glyphs use only palette letters that have light and dark tokens', () => {
    for (const name of ['terminal', 'house', 'banner'] as const) {
      const g = GLYPHS[name];
      expect(new Set(g.map((r) => r.length)).size, name).toBe(1);
      for (const row of g) expect(row, name).toMatch(/^[.ohkerlpgsHKLPGS]+$/);
    }
  });
  it('the Resources type and review filters have visible labels in both languages', () => {
    for (const [lang, labels] of [
      ['en', ['Resource type', 'Review status']],
      ['id', ['Jenis sumber daya', 'Status tinjauan']],
    ] as const) {
      const h = html({ page: 'resources' }, { lang });
      for (const l of labels)
        expect(h, l).toContain(`<span class="mb-1 block text-xs text-(--cw-muted)">${l}</span>`);
    }
  });
  it('List views keep the original source one click away', () => {
    const res = decode(html({ page: 'resources' }, { [viewKey('resources')]: 'list' }));
    expect((res.match(/data-label="Actions"/g) ?? []).length).toBe(catalog.resources.length);
  });
});
