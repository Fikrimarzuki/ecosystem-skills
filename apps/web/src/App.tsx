import { useEffect, useState } from 'react';
import { useCatalog, useRoute, type Catalog, type Route } from './lib.ts';
import { Consumers, Dashboard, Integrations, SkillDetail, SkillsExplorer } from './pages.tsx';
import { Empty } from './ui.tsx';

const NAV = [
  { href: '#/', label: 'Dashboard', page: 'dashboard' },
  { href: '#/skills', label: 'Skills', page: 'skills' },
  { href: '#/consumers', label: 'Consumers', page: 'consumers' },
  { href: '#/integrations', label: 'Integrations', page: 'integrations' },
] as const;

export function Page({ route, catalog }: { route: Route; catalog: Catalog }) {
  switch (route.page) {
    case 'skills':
      return <SkillsExplorer catalog={catalog} />;
    case 'skill':
      return <SkillDetail catalog={catalog} id={route.id} />;
    case 'consumers':
      return <Consumers catalog={catalog} />;
    case 'integrations':
      return <Integrations catalog={catalog} />;
    default:
      return <Dashboard catalog={catalog} />;
  }
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return (
    <button
      type="button"
      aria-pressed={dark}
      onClick={() => {
        const next = !dark;
        setDark(next);
        try {
          localStorage.setItem('theme', next ? 'dark' : 'light');
        } catch {
          /* storage unavailable */
        }
      }}
      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      {dark ? 'Dark' : 'Light'} theme
    </button>
  );
}

export function App() {
  const route = useRoute();
  const { catalog, error } = useCatalog();
  const current = route.page === 'skill' ? 'skills' : route.page;
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-white focus:p-2 dark:focus:bg-zinc-900"
      >
        Skip to content
      </a>
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="font-semibold tracking-tight">Ecosystem Skills</span>
          <nav
            aria-label="Primary"
            className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto"
          >
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                aria-current={current === n.page ? 'page' : undefined}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 aria-[current=page]:bg-zinc-100 aria-[current=page]:font-medium aria-[current=page]:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:aria-[current=page]:bg-zinc-800 dark:aria-[current=page]:text-zinc-100"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-8">
        {error ? (
          <Empty title="Could not load the catalog">
            {error}. Run <code>pnpm catalog:build</code> to generate it.
          </Empty>
        ) : catalog ? (
          <Page route={route} catalog={catalog} />
        ) : (
          <p role="status" className="text-sm text-zinc-500">
            Loading catalog…
          </p>
        )}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-zinc-500">
        Read-only view of the static catalog. No installation or execution happens here.
      </footer>
    </>
  );
}
