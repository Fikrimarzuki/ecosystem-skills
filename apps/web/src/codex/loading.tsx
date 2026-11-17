import type { CSSProperties, ReactElement } from 'react';
import { useT } from '../i18n.tsx';
import type { Route } from '../lib.ts';
import { Art, Layers, Painter, type Layer } from '../landing/pixel.tsx';

/*
 * ES29 loading states. They appear only while the catalog is actually being fetched (the app shell renders them in
 * place of the "Loading catalog…" line), never as a delay of their own: the moment the catalog arrives the page
 * replaces them. A short CSS fade-in (codex.css) keeps a fast load from flashing them at all. The status sentence
 * is the same as before; the book and the skeletons are decoration (aria-hidden).
 */

type Pt = readonly [number, number, string];
const rect = (x: number, y: number, w: number, h: number, c: string): Pt[] =>
  Array.from({ length: w * h }, (_, i) => [x + (i % w), y + Math.floor(i / w), c] as const);
const paint = (...parts: Pt[][]) => new Painter().patch(0, 0, parts.flat());

/** An open book, 28 × 16, in the Archivist's palette; three frames of a page turning over it. */
function bookLayers(): Layer[] {
  const pages = paint(
    // cover and its thickness
    rect(0, 12, 28, 2, 'l'),
    rect(0, 14, 28, 1, 'o'),
    rect(0, 11, 1, 3, 'o'),
    rect(27, 11, 1, 3, 'o'),
    // left page, curving up towards the spine
    rect(1, 3, 3, 1, 'o'),
    rect(4, 2, 9, 1, 'o'),
    rect(1, 4, 12, 8, 'p'),
    rect(4, 3, 9, 1, 'p'),
    rect(1, 4, 1, 8, 'o'),
    // right page
    rect(24, 3, 3, 1, 'o'),
    rect(15, 2, 9, 1, 'o'),
    rect(15, 4, 12, 8, 'p'),
    rect(15, 3, 9, 1, 'p'),
    rect(26, 4, 1, 8, 'o'),
    rect(25, 4, 1, 8, 'P'),
    // spine
    rect(13, 2, 2, 10, 'o'),
    // writing
    rect(3, 5, 8, 1, 'P'),
    rect(3, 7, 6, 1, 'P'),
    rect(3, 9, 8, 1, 'P'),
    rect(17, 5, 7, 1, 'P'),
    rect(17, 7, 5, 1, 's'),
    rect(17, 9, 7, 1, 'P'),
    // the ribbon
    rect(14, 12, 1, 3, 'r'),
  );
  const lifting = paint(rect(15, 0, 7, 1, 'o'), rect(15, 1, 7, 6, 'p'), rect(21, 1, 1, 6, 'P'));
  const upright = paint(
    rect(12, -3, 1, 13, 'o'),
    rect(15, -3, 1, 13, 'o'),
    rect(13, -3, 2, 12, 'p'),
  );
  const landing = paint(rect(7, 0, 7, 1, 'o'), rect(7, 1, 7, 6, 'p'), rect(7, 1, 1, 6, 'P'));
  const sparks = paint([[5, -2, 'g']], [[23, -1, 'G']], [[19, -3, 'g']]);
  return [
    { p: pages },
    { cls: 'sx-turn-1', p: lifting },
    { cls: 'sx-turn-2', p: upright },
    { cls: 'sx-turn-3', p: landing },
    { cls: 'sx-sparks', p: sparks },
  ];
}
let book: ReactElement | undefined;

export function PixelBook() {
  book ??= <Layers layers={bookLayers()} />;
  return (
    <span className="sx-book">
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 -4 28 19"
        shapeRendering="crispEdges"
        className="cw-px block h-full w-full"
      >
        {book}
      </svg>
    </span>
  );
}

/** Six inventory frames with pixel bars where the name, badges and record will be. */
function CardSkeletons() {
  return (
    <ul aria-hidden="true" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="sx-skel-card surface" style={{ '--i': i } as CSSProperties}>
          <span className="flex items-center gap-3">
            <span className="sx-skel h-10 w-10" />
            <span className="sx-skel h-4 w-2/3" />
          </span>
          <span className="mt-3 flex gap-1.5">
            <span className="sx-skel h-5 w-16" />
            <span className="sx-skel h-5 w-20" />
            <span className="sx-skel h-5 w-12" />
          </span>
          <span className="sx-skel mt-3 h-3 w-full" />
          <span className="sx-skel mt-1.5 h-3 w-5/6" />
          <span className="sx-skel mt-4 h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

/** The trunk and its seven branch nodes, sprouting one after another. */
function TreeSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mt-6 lg:grid lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:gap-x-8"
    >
      <div className="sx-skel-trunk surface">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="sx-skel-limb" style={{ '--i': i } as CSSProperties}>
            <span className="sx-skel h-9 w-9" />
            <span className="sx-skel h-3 w-24" />
          </span>
        ))}
      </div>
      <div className="mt-4 grid gap-3 lg:mt-0">
        <span className="sx-skel h-24 w-full" />
        <span className="sx-skel h-10 w-3/4" />
        <span className="sx-skel h-16 w-full" />
        <span className="sx-skel h-16 w-full" />
      </div>
    </div>
  );
}

/** What the shell shows while the catalog loads: the Codex opening, and the shape of the page about to appear. */
export function CodexLoading({ route }: { route: Route }) {
  const t = useT();
  // Every catalog page waits on the same catalog.json; the pages that list things also show the shape of the list.
  const catalogPage = ['skills', 'skill', 'resources', 'resource', 'sources'].includes(route.page);
  return (
    <div className="sx-loading">
      <div className="flex items-center gap-4">
        <PixelBook />
        <div>
          {catalogPage && (
            <p aria-hidden="true" className="font-bold">
              {t('Opening the Codex…')}
            </p>
          )}
          <p role="status" className="text-sm text-(--cw-muted)">
            {t('Loading catalog…')}
          </p>
        </div>
      </div>
      {route.page === 'skills' &&
        (route.query?.view === 'tree' ? <TreeSkeleton /> : <CardSkeletons />)}
      {(route.page === 'resources' || route.page === 'sources') && <CardSkeletons />}
    </div>
  );
}
