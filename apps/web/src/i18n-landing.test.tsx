import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildCatalog, type Catalog } from '@ecosystem-skills/catalog';
import { App, NAV, Page } from './App.tsx';
import { I18nProvider, LanguageSwitch, detectLang, tEn, translate } from './i18n.tsx';
import {
  GROUPS,
  GROUP_OF_CATEGORY,
  STAGE_LABEL,
  lifecycle,
  ORIGIN_LABEL,
  type Route,
} from './lib.ts';
import { GATEWAY_URL, REPO_URL, SUPPORT_URL } from './links.ts';
import { ID } from './locales/id.ts';
import { FEATURES, STATES } from './pages/Home.tsx';
import { TERMS } from './pages/Integrations.tsx';

const root = resolve(__dirname, '../../..');
const read = (n: string) =>
  JSON.parse(readFileSync(join(root, 'registry', `${n}.json`), 'utf8')) as unknown;
const built = buildCatalog({
  skills: read('skills'),
  consumers: read('consumers'),
  integrations: read('integrations'),
  evidence: read('evidence'),
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

/** Render with the language preference stored as `lang`, the way a returning visitor would have it. */
function withStoredLang<T>(lang: string | null, fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  g.localStorage = { getItem: () => lang, setItem() {} };
  try {
    return fn();
  } finally {
    delete g.localStorage;
  }
}
const page = (route: Route, lang: 'en' | 'id') =>
  text(
    withStoredLang(lang, () =>
      renderToString(
        <I18nProvider>
          <Page route={route} catalog={catalog} />
        </I18nProvider>,
      ),
    ),
  );

/** Every interface string in the code: t('…') calls plus the tables that are translated at render time. */
function interfaceStrings(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory()
        ? d.name === 'locales'
          ? []
          : walk(join(dir, d.name))
        : /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name)
          ? [join(dir, d.name)]
          : [],
    );
  for (const f of walk(__dirname)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/gs))
      found.add(m[1]!.replace(/\\'/g, "'"));
    for (const m of src.matchAll(/\brow\(\s*'[a-z]+',\s*'([^']+)'/g)) found.add(m[1]!); // lifecycle labels
  }
  for (const n of NAV) {
    found.add(n.label);
    if ('short' in n) found.add(n.short);
  }
  for (const [a, b] of [...STATES, ...TERMS]) {
    found.add(a);
    found.add(b);
  }
  for (const f of FEATURES) {
    found.add(f.title);
    found.add(f.body);
  }
  for (const v of [
    ...Object.values(STAGE_LABEL),
    ...Object.values(ORIGIN_LABEL),
    ...GROUPS,
    'Other',
  ])
    found.add(v);
  for (const v of [
    'explicit',
    'natural',
    'verified',
    'partial',
    'failed',
    'approved',
    'reviewed',
    'rejected',
  ])
    found.add(v);
  return found;
}
const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

describe('translation', () => {
  it('every interface string has an Indonesian translation with the same placeholders, and none is left over', () => {
    const strings = interfaceStrings();
    expect(strings.size).toBeGreaterThan(250);
    const missing = [...strings].filter((s) => !ID[s]);
    expect(missing, `missing Indonesian for:\n${missing.join('\n')}`).toEqual([]);
    for (const s of strings) expect(placeholders(ID[s]!), s).toBe(placeholders(s));
    const orphans = Object.keys(ID).filter((k) => !strings.has(k));
    expect(orphans, `unused translations:\n${orphans.join('\n')}`).toEqual([]);
    for (const k of Object.keys(ID)) expect(ID[k]!.trim(), k).not.toBe('');
  });

  it('every category group and category mapping is translatable', () => {
    for (const g of new Set(Object.values(GROUP_OF_CATEGORY))) expect(ID[g], g).toBeTruthy();
  });

  it('English is the key and the fallback; parameters are filled; unknown text is never blanked', () => {
    expect(tEn('Browse skills')).toBe('Browse skills');
    expect(translate('id', 'Browse skills')).toBe('Jelajahi skill');
    expect(translate('id', '{n} of {total} skills', { n: 3, total: 29 })).toBe('3 dari 29 skill');
    expect(translate('en', '{n} of {total} skills', { n: 3, total: 29 })).toBe('3 of 29 skills');
    expect(translate('id', 'A string with no translation')).toBe('A string with no translation');
    expect(translate('id', 'Hello {name}', { other: 1 })).toBe('Hello {name}'); // unfilled placeholders stay visible
  });

  it('picks the language from the stored choice, then the browser, then English', () => {
    expect(detectLang('id', 'en-US')).toBe('id');
    expect(detectLang('en', 'id-ID')).toBe('en'); // an explicit choice wins over the browser
    expect(detectLang(null, 'id-ID')).toBe('id');
    expect(detectLang(undefined, 'id')).toBe('id');
    expect(detectLang(null, 'en-GB')).toBe('en');
    expect(detectLang(null, 'indonesia-like')).toBe('en'); // only the "id" language code counts
    expect(detectLang('fr', 'fr-FR')).toBe('en'); // an unknown stored value is ignored
    expect(detectLang(null, undefined)).toBe('en');
  });

  it('renders the same pages in Indonesian, with registry content left as written', () => {
    const skills = page({ page: 'skills' }, 'id');
    expect(skills).toContain('Kemampuan agen yang dapat dipakai ulang'); // page subtitle
    expect(skills).toContain('29 dari 29 skill');
    expect(skills).toContain('Semua kategori');
    expect(skills).toContain('Pihak ketiga');
    expect(skills).not.toContain('All categories');
    const caveman = page({ page: 'skill', id: 'caveman' }, 'id');
    expect(caveman).toContain('Siklus hidup');
    expect(caveman).toContain('Tidak dilacak di sini'); // installed: not tracked here
    expect(caveman).toContain('Belum ada bukti agen'); // no evidence
    expect(caveman).toContain('Terse "caveman" reply style'); // registry description stays English
    expect(page({ page: 'consumers' }, 'id')).toContain('Dengan skill tertugaskan');
    expect(page({ page: 'integrations' }, 'id')).toContain('Kompatibilitas agen');
    expect(page({ page: 'dashboard' }, 'id')).toContain('Status tinjauan pihak ketiga');
  });

  it('lifecycle labels and meanings translate without losing their separate states', () => {
    const s = catalog.skills.find((x) => x.id === 'caveman')!;
    const id = lifecycle(catalog, s, (k, p) => translate('id', k, p));
    expect(id.map((r) => r.key)).toEqual(lifecycle(catalog, s).map((r) => r.key));
    expect(id.map((r) => r.label)).toEqual([
      'Terdaftar',
      'Ditinjau',
      'Disetujui',
      'Terinstal',
      'Ditugaskan',
      'Diaktifkan',
      'Terverifikasi',
    ]);
    // Same kinds in both languages: translation never changes what is claimed.
    expect(id.map((r) => r.kind)).toEqual(lifecycle(catalog, s).map((r) => r.kind));
  });

  it('the language switch offers both languages and marks the active one', () => {
    const html = withStoredLang('id', () =>
      renderToString(
        <I18nProvider>
          <LanguageSwitch />
        </I18nProvider>,
      ),
    );
    expect(html).toContain('>EN<');
    expect(html).toContain('>ID<');
    expect(html).toMatch(/aria-pressed="true"[^>]*>ID</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>EN</);
    expect(html).toContain('aria-label="Bahasa"'); // the group is labelled in the active language
  });
});

describe('landing page', () => {
  it('explains what the site is, with live numbers from the catalog', () => {
    const p = page({ page: 'home' }, 'en');
    expect(p).toContain('One place to manage the skills your AI agents use');
    expect(p).toContain('What is this website?');
    expect(p).toContain('A registry, not a marketplace');
    expect(p).toContain('Nothing is trusted by default');
    expect(p).toContain('How a skill is tracked');
    expect(p).toContain('What this site does and does not do');
    expect(p).toContain('Install, run or change anything');
    // Seven separate states, never a progress bar.
    for (const [name] of STATES) expect(p).toContain(name);
    expect(p).toContain(
      'Approved is not installed. Assigned is not activated. Activated is not verified.',
    );
    expect(p).toMatch(new RegExp(`${catalog.skills.length} Registered skills`));
    expect(p).toMatch(new RegExp(`${catalog.consumers.length} Consumer projects`));
    expect(p).toMatch(new RegExp(`${catalog.evidence.length} Agent evidence records`));
    const html = renderToString(<Page route={{ page: 'home' }} catalog={catalog} />);
    expect(html).not.toMatch(/role="progressbar"|<progress/);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it('renders without a catalog (loading, and failed) so the explanation is always there', () => {
    const g = globalThis as Record<string, unknown>;
    g.document = { documentElement: { classList: { contains: () => false, toggle() {} } } };
    g.location = { pathname: '/', search: '', hash: '' };
    try {
      const html = text(renderToString(<App />));
      expect(html).toContain('One place to manage the skills your AI agents use');
      expect(html).toContain('Loading catalog…');
    } finally {
      delete g.document;
      delete g.location;
    }
  });

  it('the dashboard still renders at its new route, and the nav marks Home and Overview separately', () => {
    expect(NAV.map((n) => [n.page, n.path])).toEqual([
      ['home', '/'],
      ['dashboard', '/overview'],
      ['skills', '/skills'],
      ['consumers', '/consumers'],
      ['integrations', '/integrations'],
    ]);
    expect(page({ page: 'dashboard' }, 'en')).toContain('Third-party review status');
  });
});

describe('outbound links', () => {
  it('Help & Contact points to support.fikrimarzuki.work, Gateway to the existing Gateway URL, both on the author’s domain', () => {
    expect(SUPPORT_URL).toBe('https://support.fikrimarzuki.work');
    expect(GATEWAY_URL).toBe('https://fikrimarzuki.work'); // the existing destination, unchanged
    for (const url of [SUPPORT_URL, GATEWAY_URL]) {
      const u = new URL(url);
      expect(u.protocol, url).toBe('https:');
      expect(
        u.hostname === 'fikrimarzuki.work' || u.hostname.endsWith('.fikrimarzuki.work'),
        url,
      ).toBe(true);
    }
    expect(new URL(REPO_URL).hostname).toBe('github.com');
  });

  const shell = (pathname: string) => {
    const g = globalThis as Record<string, unknown>;
    g.document = { documentElement: { classList: { contains: () => false, toggle() {} } } };
    g.location = { pathname, search: '', hash: '' };
    try {
      return renderToString(<App />);
    } finally {
      delete g.document;
      delete g.location;
    }
  };
  const anchors = (html: string, href: string) =>
    [
      ...html.matchAll(
        new RegExp(`<a [^>]*href="${href.replace(/[.]/g, '\\.')}"[^>]*>.*?</a>`, 'gs'),
      ),
    ].map((m) => m[0]);

  it('contact: nav, hero, landing section and footer all go to the support site, with a message icon and no heart or donation wording', () => {
    const html = shell('/skills');
    const links = anchors(html, 'https://support.fikrimarzuki.work');
    expect(links.length).toBeGreaterThanOrEqual(3); // nav (both layouts) + footer
    for (const a of links) {
      expect(a).toContain('target="_blank"');
      expect(a).toMatch(/rel="noreferrer noopener"/);
      expect(text(a)).toContain('Help & Contact');
    }
    const home = renderToString(<Page route={{ page: 'home' }} catalog={catalog} />);
    const homeLinks = anchors(home, 'https://support.fikrimarzuki.work').map(text);
    expect(homeLinks.some((l) => l.includes('Get in touch'))).toBe(true); // hero button
    expect(homeLinks.some((l) => l.includes('Open Help & Contact'))).toBe(true); // contact section
    const all = html + home;
    expect(all).not.toMatch(/M20\.8 5\.6a5\.2/); // the heart icon path is gone
    expect(all).toMatch(/M21 11\.5a8\.4 8\.4/); // the message-circle icon path
    expect(text(all)).not.toMatch(/donat|sponsor|tip jar|buy me/i);
    expect(text(home)).toContain(
      'ask a question, request assistance, send feedback or simply get in touch',
    );
  });

  it('More projects is one Gateway destination: one wide card on the landing page and one footer link', () => {
    const home = renderToString(<Page route={{ page: 'home' }} catalog={catalog} />);
    expect(text(home)).toContain('Explore More Projects');
    expect(text(home)).toContain('part of my personal development ecosystem');
    const gw = anchors(home, 'https://fikrimarzuki.work').map(text);
    expect(gw).toHaveLength(1);
    expect(gw[0]).toContain('Explore Gateway');
    const footer = shell('/skills');
    const fl = anchors(footer, 'https://fikrimarzuki.work').map(text);
    expect(fl).toHaveLength(1);
    expect(fl[0]).toContain('Explore more projects');
    // No individual project links remain anywhere.
    for (const host of [
      'projects',
      'tools',
      'devtools',
      'playnest',
      'playdeck',
      'learn',
      'roadmap',
      'games',
      'tinyverse',
      'cv',
    ])
      expect(home + footer, host).not.toContain(`https://${host}.fikrimarzuki.work`);
  });

  it('Indonesian wording for the Gateway card, contact links and headline', () => {
    const id = text(
      withStoredLang('id', () =>
        renderToString(
          <I18nProvider>
            <Page route={{ page: 'home' }} catalog={catalog} />
          </I18nProvider>,
        ),
      ),
    );
    for (const s of [
      'Satu tempat untuk mengelola skill yang digunakan agen AI Anda',
      'Jelajahi Proyek Lainnya',
      'Ecosystem Skills adalah bagian dari ekosistem proyek pribadi saya. Temukan proyek, game, eksperimen, dan alat pengembangan lainnya melalui Gateway.',
      'Jelajahi Gateway',
      'Hubungi Saya',
      'Buka Bantuan & Kontak',
    ])
      expect(id, s).toContain(s);
    const chrome = text(withStoredLang('id', () => shell('/skills')));
    expect(chrome).toContain('Bantuan & Kontak'); // header and footer
    expect(chrome).toContain('Jelajahi proyek lainnya'); // footer
  });

  it('every external link on every page opens safely and announces the new tab', () => {
    for (const route of [
      { page: 'home' },
      { page: 'skills' },
      { page: 'skill', id: 'caveman' },
    ] as Route[]) {
      const html = renderToString(<Page route={route} catalog={catalog} />);
      for (const m of html.matchAll(/<a [^>]*href="https?:[^"]*"[^>]*>/g))
        expect(m[0], m[0]).toMatch(/rel="noreferrer noopener"|rel="noopener noreferrer"/);
    }
  });
});
