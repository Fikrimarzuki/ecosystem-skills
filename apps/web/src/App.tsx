import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { I18nProvider, LanguageSwitch, useT } from './i18n.tsx';
import { homeHref, pageHref, useCatalog, useRoute, type Catalog, type Route } from './lib.ts';
import { GATEWAY_URL, REPO_URL, SUPPORT_URL } from './links.ts';
import { Consumers } from './pages/Consumers.tsx';
import { Ecosystem } from './pages/Ecosystem.tsx';
import { Home } from './pages/Home.tsx';
import { Integrations } from './pages/Integrations.tsx';
import { ResourceDetail, Resources } from './pages/Resources.tsx';
import { Sources } from './pages/Sources.tsx';
import { Overview } from './pages/Overview.tsx';
import { SkillDetail } from './pages/SkillDetail.tsx';
import { SkillsExplorer } from './pages/Skills.tsx';
import { Archivist, Glyph } from './art.tsx';
import { MotionToggle } from './motion.tsx';
import { Empty, ExternalIcon, MoonIcon, PageHeader, SunIcon } from './ui.tsx';

/*
 * Landing prototypes (ES28.4): development preview only. Concept A became the landing page in ES28.5; Concept B and
 * the prototype index remain as a development reference. The flag is a build-time constant: always on under `vite`
 * (dev), on in a production-like preview only with VITE_LANDING_PROTOTYPES=1, and off in the normal build, where
 * every branch below folds to `false` and the lazy chunk is never emitted (so it is not published, not in the
 * navigation and not in the service-worker cache).
 */
const LANDING_PROTOTYPES = import.meta.env.DEV || import.meta.env.VITE_LANDING_PROTOTYPES === '1';
const LandingPrototype = LANDING_PROTOTYPES ? lazy(() => import('./prototypes/index.tsx')) : null;
const prototypeOf = (route: Route): 'index' | 'b' | undefined => {
  if (!LANDING_PROTOTYPES || route.page !== 'notfound') return undefined;
  const m = /^\/_prototypes(\/archive-overworld)?\/?$/.exec(route.path);
  return m ? (m[1] ? 'b' : 'index') : undefined;
};

/** Main navigation. `path` is the app path (clean URL); the rendered href adds the deployment base, if any. */
/*
 * ES26: Home is not listed (the brand mark links to "/"), and Help & Contact moved to the footer and the landing page.
 * Catalog pages come first (Skills, Resources, Sources), then the ecosystem and usage pages.
 */
export const NAV = [
  { path: '/overview', label: 'Overview', page: 'dashboard' },
  { path: '/skills', label: 'Skills', page: 'skills' },
  { path: '/resources', label: 'Resources', page: 'resources' },
  { path: '/sources', label: 'Sources', page: 'sources' },
  { path: '/ecosystem', label: 'FM Ecosystem', page: 'ecosystem' },
  { path: '/consumers', label: 'Consumers', page: 'consumers' },
  { path: '/integrations', label: 'Agents & tools', page: 'integrations' },
] as const;
const navHref = (path: string) => pageHref(path.slice(1) as 'skills');
/** The nav entry that is "current" for a route (detail pages highlight their list page). */
export const navPageOf = (route: Route): string =>
  route.page === 'skill' ? 'skills' : route.page === 'resource' ? 'resources' : route.page;

export function Page({ route, catalog }: { route: Route; catalog: Catalog }) {
  switch (route.page) {
    case 'skills':
      // The filters live in the URL (route.query), so the explorer needs no remounting or local state.
      return <SkillsExplorer catalog={catalog} query={route.query} />;
    case 'skill':
      return <SkillDetail catalog={catalog} id={route.id} />;
    case 'consumers':
      return <Consumers catalog={catalog} />;
    case 'integrations':
      return <Integrations catalog={catalog} />;
    case 'sources':
      return <Sources catalog={catalog} />;
    case 'resources':
      return <Resources catalog={catalog} query={route.query} />;
    case 'resource':
      return <ResourceDetail catalog={catalog} id={route.id} />;
    case 'dashboard':
      return <Overview catalog={catalog} />;
    case 'ecosystem':
      return <Ecosystem catalog={catalog} />;
    case 'notfound':
      return <NotFound path={route.path} />;
    default:
      return <Home catalog={catalog} />;
  }
}

/** Unknown URL: say so plainly and offer the two useful ways out. */
function NotFound({ path }: { path: string }) {
  const t = useT();
  return (
    <>
      <PageHeader title={t('Page not found')} />
      <Empty title={t('There is no page at “{path}”.', { path })} pose="lost">
        <a href={homeHref()} className="underline">
          {t('Home')}
        </a>
        {' · '}
        <a href={pageHref('skills')} className="underline">
          {t('Skills')}
        </a>
      </Empty>
    </>
  );
}

/** Browser-tab title for the current page, so history entries and bookmarks are distinguishable. */
function pageTitle(route: Route, catalog: Catalog | undefined, t: ReturnType<typeof useT>): string {
  const base = 'Ecosystem Skills';
  switch (route.page) {
    case 'home':
      return base;
    case 'dashboard':
      return `${t('Overview')} · ${base}`;
    case 'skills':
      return `${t('Skills')} · ${base}`;
    case 'skill':
      return `${catalog?.skills.find((s) => s.id === route.id)?.name ?? route.id} · ${base}`;
    case 'consumers':
      return `${t('Consumers')} · ${base}`;
    case 'integrations':
      return `${t('Agents & tools')} · ${base}`;
    case 'sources':
      return `${t('Sources')} · ${base}`;
    case 'resources':
      return `${t('Resources')} · ${base}`;
    case 'resource':
      return `${catalog?.resources.find((r) => r.id === route.id)?.name ?? route.id} · ${base}`;
    case 'ecosystem':
      return `${t('FM Ecosystem skills')} · ${base}`;
    default:
      return `${t('Page not found')} · ${base}`;
  }
}

function ThemeToggle() {
  const t = useT();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  const label = dark ? t('Switch to light theme') : t('Switch to dark theme');
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = !dark;
        setDark(next);
        try {
          localStorage.setItem('theme', next ? 'dark' : 'light');
        } catch {
          /* storage unavailable */
        }
      }}
      className="cw-tool"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function NavLinks({ current, vertical = false }: { current: string; vertical?: boolean }) {
  const t = useT();
  return (
    <ul className={`cw-nav ${vertical ? 'grid gap-1' : 'flex items-center gap-0.5'}`}>
      {NAV.map((n) => (
        <li key={n.path}>
          <a
            href={navHref(n.path)}
            aria-current={current === n.page ? 'page' : undefined}
            className={`block text-sm whitespace-nowrap text-(--cw-ink) hover:bg-(--cw-sunken) ${
              vertical ? 'px-3 py-2.5' : 'px-2.5 py-1.5'
            }`}
          >
            {t(n.label)}
          </a>
        </li>
      ))}
    </ul>
  );
}

const MenuIcon = ({ open }: { open: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
  </svg>
);

/**
 * Below the xl breakpoint the primary links live in a disclosure menu: a real button (aria-expanded/aria-controls),
 * Escape closes it and returns focus, and it closes on navigation. Every link stays an ordinary anchor.
 */
function MobileMenu({ current }: { current: string }) {
  const t = useT();
  // Open "for" the page it was opened on: navigating to another page closes it without an effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === current;
  const setOpen = (v: boolean) => setOpenFor(v ? current : null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenFor(null);
        button.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <div className="xl:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen(!open)}
        className="cw-tool"
      >
        <MenuIcon open={open} />
        <span className="sr-only sm:not-sr-only">{t('Menu')}</span>
      </button>
      <nav
        id="site-menu"
        aria-label={t('Primary')}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b-4 border-(--cw-edge) bg-(--cw-window) px-4 py-3 shadow-[0_4px_0_0_var(--cw-drop)]"
        onClick={(e) => {
          if ((e.target as Element).closest('a')) setOpen(false);
        }}
      >
        <div className="mx-auto max-w-6xl">
          <NavLinks current={current} vertical />
        </div>
      </nav>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: string }) {
  const t = useT();
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline-offset-2 hover:underline"
    >
      {children}
      <span className="sr-only"> {t('(opens in a new tab)')}</span>
    </a>
  );
}

function Footer() {
  const t = useT();
  return (
    <footer className="mt-12 border-t-4 border-(--cw-edge) bg-(--cw-window)">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <p className="flex items-center gap-2 font-bold">
            <Glyph name="ledger" />
            Ecosystem Skills
          </p>
          <p className="mt-2 max-w-prose text-(--cw-muted)">
            {t('AI-agent skills, MCP servers, agent toolkits, references, and related resources.')}
          </p>
        </div>
        <nav aria-label={t('More')}>
          <ul className="space-y-1">
            <li>
              <a
                href={GATEWAY_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                {t('Explore more projects')}
                <ExternalIcon width={12} height={12} />
                <span className="sr-only"> {t('(opens in a new tab)')}</span>
              </a>
            </li>
            <li>
              <FooterLink href={REPO_URL}>{t('Source on GitHub')}</FooterLink>
            </li>
            <li>
              <FooterLink href={SUPPORT_URL}>{t('Help & Contact')}</FooterLink>
            </li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-6 text-xs text-(--cw-muted)">
        {t(
          'Read-only view of a static catalog generated from the registry. Nothing is installed or run from this site.',
        )}{' '}
        {t(
          'Registry content such as skill descriptions and review notes is shown as written, in English.',
        )}
      </p>
    </footer>
  );
}

/** Shown when the catalog came from the offline cache (PWA): it may be stale and is never authoritative. */
function OfflineNotice() {
  const t = useT();
  return (
    <div
      role="status"
      className="border-b-2 border-amber-700 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        {/* Decorative: the Archivist reading the saved copy by lantern light. The sentence says everything. */}
        <Archivist pose="offline" scale={2} className="hidden shrink-0 sm:block" />
        <p>
          {t(
            'Offline: showing a saved copy of the catalog. It may be out of date and is not authoritative for review, approval or installation.',
          )}
        </p>
      </div>
    </div>
  );
}

function Shell() {
  const t = useT();
  const route = useRoute();
  const { catalog, error, offline } = useCatalog();
  const current = navPageOf(route);
  const proto = LANDING_PROTOTYPES ? prototypeOf(route) : undefined;
  useEffect(() => {
    document.title =
      LANDING_PROTOTYPES && prototypeOf(route)
        ? 'Landing prototype · Ecosystem Skills'
        : pageTitle(route, catalog, t);
  }, [route, catalog, t]);
  // ES28.2: a link to a section (/skills/caveman#technical, /sources#<source-id>) scrolls there once the catalog has
  // rendered the page; the browser's own jump happens too early, before the section exists. Old "#/…" routes are
  // rewritten by the router before this runs and never reach it.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!catalog || !id || id.startsWith('/')) return;
    document.getElementById(id)?.scrollIntoView();
  }, [route, catalog]);
  return (
    <>
      <div aria-hidden="true" className="app-bg" />
      <a
        href="#main"
        onClick={(e) => {
          // Hash routing owns the URL, so move focus instead of changing the hash.
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:border-2 focus:border-(--cw-edge) focus:bg-(--cw-window) focus:p-2"
      >
        {t('Skip to content')}
      </a>
      <header className="sticky top-0 z-40 border-b-4 border-(--cw-edge) bg-(--cw-window) shadow-[0_3px_0_0_var(--cw-drop)]">
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <a
            href={homeHref()}
            aria-label={t('Ecosystem Skills home')}
            className="flex min-h-10 min-w-0 items-center gap-2 font-bold"
          >
            <span className="cw-slot h-8! w-8!">
              <Glyph name="ledger" />
            </span>
            {/* Two short lines on phones, one line from 640 px; below 360 px the tile alone (the link keeps its name). */}
            <span className="min-w-0 text-[13px] leading-tight max-[359px]:sr-only sm:truncate sm:text-base sm:leading-normal">
              Ecosystem Skills
            </span>
          </a>
          <nav aria-label={t('Primary')} className="hidden min-w-0 xl:block">
            <NavLinks current={current} />
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <LanguageSwitch />
            <ThemeToggle />
            <MotionToggle />
            <MobileMenu current={current} />
          </div>
        </div>
      </header>
      {offline && <OfflineNotice />}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto min-h-[calc(100dvh-4rem)] max-w-6xl px-4 py-8 break-words outline-none sm:py-10"
      >
        {route.page === 'home' ? (
          // The landing page explains the site before any data, so it renders even while (or if) the catalog loads.
          <Home catalog={catalog} error={error} />
        ) : LANDING_PROTOTYPES && LandingPrototype && proto ? (
          <Suspense fallback={<p role="status">{t('Loading catalog…')}</p>}>
            <LandingPrototype which={proto} catalog={catalog} />
          </Suspense>
        ) : error ? (
          <Empty title={t('Could not load the catalog')}>
            {t(
              '{error}. The site could not read catalog.json. If you run it locally, rebuild it with pnpm build.',
              { error },
            )}
          </Empty>
        ) : catalog ? (
          <Page route={route} catalog={catalog} />
        ) : (
          <p role="status" className="text-sm text-(--cw-muted)">
            {t('Loading catalog…')}
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}

export function App() {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}
