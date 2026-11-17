/*
 * Browser-history routing with clean URLs (/skills/caveman), replacing the earlier hash routes (/#/skills/caveman).
 * No routing library: the site has five static pages, one parameterised page and a few query parameters.
 *
 * App paths ("/skills?status=approved") are what the rest of the code uses; this module adds the deployment base
 * path (BASE_PATH, e.g. "/ecosystem-skills/" on a GitHub Pages project site) when talking to the browser.
 */

/** Deployment base without a trailing slash: "" for a root domain, "/ecosystem-skills" for a sub-path. */
export const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/+$/, '');

/** Browser URL for an app path such as "/skills?q=x" (or "/" for the landing page). */
export const href = (appPath: string): string => `${BASE}${appPath}`;

/** App path for a browser pathname, or undefined when the pathname is outside the deployment base. */
export function stripBase(pathname: string): string | undefined {
  if (!BASE) return pathname || '/';
  if (pathname === BASE) return '/';
  return pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length) : undefined;
}

const SECTIONS = new Set(['overview', 'skills', 'consumers', 'integrations']);

/**
 * Old bookmarks look like /#/skills?status=approved. If the fragment is one of the old routes, return the clean
 * app path ("/skills?status=approved"); otherwise undefined. Rules:
 *  - only fragments that start with "#/" and name a real old route are converted; anything else ("#main",
 *    "#/something-unknown", "#section") is an ordinary fragment and left alone, so it is never treated as a route;
 *  - query parameters inside the fragment are kept; they win over parameters already in the real query string;
 *  - the fragment is dropped from the result, so converting twice is a no-op (no redirect loop).
 */
export function legacyToClean(loc: { search: string; hash: string }): string | undefined {
  const m = /^#\/([^?#]*)(?:\?([^#]*))?/.exec(loc.hash);
  if (!m) return undefined;
  const segment = m[1]!.replace(/\/+$/, '');
  const parts = segment.split('/');
  const isRoute =
    segment === '' ||
    (parts.length === 1 && SECTIONS.has(parts[0]!)) ||
    (parts.length === 2 && parts[0] === 'skills' && parts[1] !== '');
  if (!isRoute) return undefined;
  const q = new URLSearchParams(loc.search);
  for (const [k, v] of new URLSearchParams(m[2] ?? '')) q.set(k, v);
  const qs = q.toString();
  return `${segment ? `/${segment}` : '/'}${qs ? `?${qs}` : ''}`;
}

/** The current app path plus query ("/skills?q=x"), or "/" outside the base. */
export function currentUrl(): string {
  const path = stripBase(location.pathname) ?? '/';
  return `${path}${location.search ?? ''}`;
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let installed = false;

/** Rewrites an old hash URL to its clean equivalent in place (replaceState: no reload, no extra history entry). */
export function normalizeLegacyUrl(): boolean {
  const clean = legacyToClean(location);
  if (clean === undefined) return false;
  history.replaceState(null, '', href(clean));
  return true;
}

/** useSyncExternalStore-style subscription to URL changes (links, Back/Forward, pasted legacy hashes). */
export function subscribe(listener: () => void): () => void {
  if (!installed && typeof window !== 'undefined') {
    installed = true;
    window.addEventListener('popstate', emit);
    window.addEventListener('hashchange', () => {
      if (normalizeLegacyUrl()) emit(); // an old #/… link pasted or clicked while the app is open
    });
    document.addEventListener('click', onLinkClick);
  }
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Go to an app path. `replace` swaps the current history entry (used while typing in a search box, so Back is not
 * flooded); otherwise a new entry is added. Navigating to the URL already shown does nothing.
 */
export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const target = href(to);
  if (target === `${location.pathname}${location.search ?? ''}`) return;
  const pathChanged = target.split('?')[0] !== location.pathname;
  if (opts.replace) history.replaceState(null, '', target);
  else history.pushState(null, '', target);
  emit();
  if (pathChanged && !opts.replace) {
    // A new page: start at the top and move focus to the content, as a full page load would.
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }
}

/** Turns clicks on ordinary same-site links into history navigation; everything else keeps native behaviour. */
export function onLinkClick(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  const a = (e.target as Element | null)?.closest?.('a');
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  const raw = a.getAttribute('href');
  if (!raw || raw.startsWith('#')) return; // in-page anchors such as the skip link
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  const path = stripBase(url.pathname);
  if (path === undefined) return;
  e.preventDefault();
  navigate(`${path}${url.search}`);
}
