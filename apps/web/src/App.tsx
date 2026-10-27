import { useEffect, useState } from 'react';
import { I18nProvider, LanguageSwitch, useT } from './i18n.tsx';
import { homeHref, pageHref, useCatalog, useRoute, type Catalog, type Route } from './lib.ts';
import { GATEWAY_URL, REPO_URL, SUPPORT_URL } from './links.ts';
import { Consumers } from './pages/Consumers.tsx';
import { Home } from './pages/Home.tsx';
import { Integrations } from './pages/Integrations.tsx';
import { Overview } from './pages/Overview.tsx';
import { SkillDetail } from './pages/SkillDetail.tsx';
import { SkillsExplorer } from './pages/Skills.tsx';
import {
  Empty,
  ExternalIcon,
  LogoMark,
  MessageIcon,
  MoonIcon,
  PageHeader,
  SunIcon,
} from './ui.tsx';

/** Main navigation. `path` is the app path (clean URL); the rendered href adds the deployment base, if any. */
export const NAV = [
  { path: '/', label: 'Home', page: 'home' },
  { path: '/overview', label: 'Overview', page: 'dashboard' },
  { path: '/skills', label: 'Skills', page: 'skills' },
  { path: '/consumers', label: 'Consumers', page: 'consumers' },
  { path: '/integrations', label: 'Agents & tools', short: 'Agents', page: 'integrations' },
] as const;
const navHref = (path: string) => (path === '/' ? homeHref() : pageHref(path.slice(1) as 'skills'));

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
    case 'dashboard':
      return <Overview catalog={catalog} />;
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
      <Empty title={t('There is no page at “{path}”.', { path })}>
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-300 bg-white/70 text-zinc-700 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function NavLinks({ current }: { current: string }) {
  const t = useT();
  // `relative` on the list: visually-hidden text inside is absolutely positioned and must be clipped by this
  // scroller, not by the sticky header (otherwise it widens the whole page on narrow screens).
  return (
    <ul className="relative flex items-center gap-1 overflow-x-auto">
      {NAV.map((n) => (
        <li key={n.path}>
          <a
            href={navHref(n.path)}
            aria-current={current === n.page ? 'page' : undefined}
            className="block rounded-xl px-3 py-1.5 text-sm whitespace-nowrap text-zinc-700 hover:bg-white/80 aria-[current=page]:bg-indigo-600 aria-[current=page]:font-medium aria-[current=page]:text-white dark:text-zinc-300 dark:hover:bg-zinc-800 dark:aria-[current=page]:bg-indigo-600 dark:aria-[current=page]:text-white"
          >
            {'short' in n ? (
              <>
                <span className="sm:hidden">{t(n.short)}</span>
                <span className="hidden sm:inline">{t(n.label)}</span>
              </>
            ) : (
              t(n.label)
            )}
          </a>
        </li>
      ))}
      <li>
        {/* The help and contact site is a separate project: it opens in a new tab and is marked as external. */}
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium whitespace-nowrap text-fuchsia-800 hover:bg-white/80 dark:text-fuchsia-300 dark:hover:bg-zinc-800"
        >
          <MessageIcon width={14} height={14} />
          {t('Help & Contact')}
          <ExternalIcon width={12} height={12} />
          <span className="sr-only"> {t('(opens in a new tab)')}</span>
        </a>
      </li>
    </ul>
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
    <footer className="mt-12 border-t border-zinc-200/80 bg-white/60 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 text-sm text-zinc-700 sm:grid-cols-3 dark:text-zinc-300">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <LogoMark className="text-indigo-600 dark:text-indigo-300" />
            Ecosystem Skills
          </p>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            {t('A read-only registry of the AI-agent skills used across my projects.')}
          </p>
        </div>
        <nav aria-label={t('Ecosystem')}>
          <h2 className="font-semibold">{t('Ecosystem')}</h2>
          <ul className="mt-2 space-y-1">
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
          </ul>
        </nav>
        <nav aria-label={t('This site')}>
          <h2 className="font-semibold">{t('This site')}</h2>
          <ul className="mt-2 space-y-1">
            <li>
              <a href={pageHref('skills')} className="underline-offset-2 hover:underline">
                {t('Skills')}
              </a>
            </li>
            <li>
              <a href={pageHref('consumers')} className="underline-offset-2 hover:underline">
                {t('Consumers')}
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
      <p className="mx-auto max-w-6xl px-4 pb-6 text-xs text-zinc-600 dark:text-zinc-400">
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

function Shell() {
  const t = useT();
  const route = useRoute();
  const { catalog, error } = useCatalog();
  const current = route.page === 'skill' ? 'skills' : route.page;
  useEffect(() => {
    document.title = pageTitle(route, catalog, t);
  }, [route, catalog, t]);
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
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-white focus:p-2 dark:focus:bg-zinc-900"
      >
        {t('Skip to content')}
      </a>
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/75">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <a href={homeHref()} className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-linear-to-br from-indigo-600 to-fuchsia-600 text-white shadow-sm">
              <LogoMark width={18} height={18} />
            </span>
            <span>Ecosystem Skills</span>
          </a>
          <nav aria-label={t('Primary')} className="hidden lg:block">
            <NavLinks current={current} />
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </div>
        <nav
          aria-label={t('Primary (compact)')}
          className="border-t border-zinc-200/70 px-4 py-1.5 lg:hidden dark:border-zinc-800/80"
        >
          <NavLinks current={current} />
        </nav>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-8 break-words outline-none sm:py-10"
      >
        {route.page === 'home' ? (
          // The landing page explains the site before any data, so it renders even while (or if) the catalog loads.
          <Home catalog={catalog} error={error} />
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
          <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
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
