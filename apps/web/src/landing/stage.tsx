import { memo, type CSSProperties, type ReactNode } from 'react';
import { Glyph, Wordmark, type GlyphName } from '../art.tsx';
import { useT } from '../i18n.tsx';
import { ecosystemSkills, pageHref, skillsHref, type Catalog } from '../lib.ts';
import { Art, Layers, type Layer } from './pixel.tsx';

/*
 * The landing stage (ES28.4 prototype, the production landing since ES28.5): the illustrated scene (decorative,
 * aria-hidden) with real links laid over each destination. Each link is a sign hanging in the room: an icon, the
 * place's name and its live count; its accessible name also says where it goes. Hover and keyboard focus show RPG
 * selection brackets in the art and make the Archivist look that way (CSS only, via :has, so the art never
 * re-renders). A tap simply follows the link: nothing depends on hover or on animation.
 */

export type SpotId = 'skills' | 'resources' | 'sources' | 'ecosystem';
export interface Spot {
  id: SpotId;
  /** Hit area in scene pixels: x, y, w, h. */
  box: readonly [number, number, number, number];
  /** Where the sign hangs, in scene pixels: its top-left corner, or its top-right with `plateEnd`. */
  plate: readonly [number, number];
  plateEnd?: boolean;
  /** The sign's minimum width in scene pixels, so it always meets the chains drawn in the art. */
  plateMin?: number;
  /** Which way the Archivist looks when this place is chosen. */
  look: 'left' | 'right';
}
export interface SceneDef {
  w: number;
  h: number;
  layers: Layer[];
  spots: Spot[];
  /** Area of the scene where the headline is laid over the art on wide screens: x, y, w, h. */
  board?: readonly [number, number, number, number];
}

/** The site-wide icon of each catalog (the same glyphs as everywhere else on the site). */
export const SPOT_GLYPH: Record<SpotId, GlyphName> = {
  skills: 'ledger',
  resources: 'satchel',
  sources: 'shelf',
  ecosystem: 'banner',
};

export function destinations(catalog: Catalog | undefined) {
  return {
    skills: { href: skillsHref({}), n: catalog?.skills.length },
    resources: { href: pageHref('resources'), n: catalog?.resources.length },
    sources: { href: pageHref('sources'), n: catalog?.sources.length },
    ecosystem: {
      href: pageHref('ecosystem'),
      n: catalog ? ecosystemSkills(catalog).length : undefined,
    },
  } satisfies Record<SpotId, { href: string; n?: number }>;
}

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

/** The art for one composition, rendered once (memo): hover and focus are CSS, language changes skip it. */
const SceneArt = memo(function SceneArt({ def }: { def: SceneDef }) {
  return (
    <Art w={def.w} h={def.h}>
      <Layers layers={def.layers} />
    </Art>
  );
});

export interface PlaceText {
  name: string;
  count: (n: number) => string;
  action: string;
}

/** One composition: the art plus a real link, hung as a sign, over every destination. */
export function Canvas({
  def,
  places,
  catalog,
  className,
}: {
  def: SceneDef;
  places: Record<SpotId, PlaceText>;
  catalog: Catalog | undefined;
  className: string;
}) {
  const d = destinations(catalog);
  return (
    <div className={`lp-canvas ${className}`} style={{ aspectRatio: `${def.w} / ${def.h}` }}>
      <SceneArt def={def} />
      {def.board && (
        // When the headline is not written on the scroll (narrower screens), the scroll carries the pixel wordmark.
        <div
          aria-hidden="true"
          className="lp-board-art"
          style={{
            left: pct(def.board[0], def.w),
            top: pct(def.board[1], def.h),
            width: pct(def.board[2], def.w),
            height: pct(def.board[3], def.h),
          }}
        >
          <Wordmark className="cw-wordmark" />
        </div>
      )}
      {def.spots.map((s) => {
        const [x, y, w, h] = s.box;
        const place = places[s.id];
        const n = d[s.id].n;
        const style: CSSProperties & Record<string, string> = {
          left: pct(x, def.w),
          top: pct(y, def.h),
          width: pct(w, def.w),
          height: pct(h, def.h),
          '--plate-x': pct(s.plate[0] - x, w),
          '--plate-y': pct(s.plate[1] - y, h),
          '--plate-min': s.plateMin ? pct(s.plateMin, w) : 'auto',
        };
        return (
          <a
            key={s.id}
            href={d[s.id].href}
            className="lp-spot"
            data-spot={s.id}
            data-look={s.look}
            data-end={s.plateEnd ? '' : undefined}
            style={style}
          >
            <span className="lp-plate">
              <Glyph name={SPOT_GLYPH[s.id]} className="lp-plate-icon" />
              <span className="lp-plate-text">
                <span className="lp-plate-name">{place.name}</span>
                <span className="lp-plate-count">{n === undefined ? '…' : place.count(n)}</span>
              </span>
              <span className="sr-only">. {place.action}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}

/** Wordmark, headline, description, live counts and the three direct actions; on the scroll on wide screens. */
export function Intro({
  catalog,
  error,
  children,
}: {
  catalog: Catalog | undefined;
  error?: string;
  children?: ReactNode;
}) {
  const t = useT();
  const d = destinations(catalog);
  return (
    <div className="lp-intro">
      <Wordmark className="cw-wordmark lp-wordmark" />
      <p className="lp-kicker">{t('A personal registry for AI-agent skills')}</p>
      <h1 id="hero-h" className="lp-title">
        {t('One place to manage the skills your AI agents use')}
      </h1>
      <p className="lp-lede">
        {t(
          'Every reusable skill, MCP server and agent resource, with where it came from, how it was reviewed and which project uses it.',
        )}
      </p>
      <p className="lp-counts" aria-live="polite">
        {catalog
          ? t('{skills} skills · {resources} resources · {sources} sources, all read-only.', {
              skills: catalog.skills.length,
              resources: catalog.resources.length,
              sources: catalog.sources.length,
            })
          : error
            ? t(
                'The live numbers could not be loaded ({error}). The rest of this page still applies.',
                { error },
              )
            : t('Loading catalog…')}
      </p>
      <div className="lp-actions">
        <a href={d.skills.href} className="btn-primary cw-pointer lp-btn">
          {t('Browse skills')}
        </a>
        <a href={d.resources.href} className="btn-secondary cw-pointer lp-btn">
          {t('Explore resources')}
        </a>
        <a href={d.sources.href} className="btn-secondary cw-pointer lp-btn">
          {t('View sources')}
        </a>
      </div>
      {children}
    </div>
  );
}

/** The hero: intro plus a wide and a phone composition (CSS shows one of them, by width). */
export function Hero({
  variant,
  wide,
  phone,
  places,
  catalog,
  error,
}: {
  variant: string;
  wide: SceneDef;
  phone: SceneDef;
  places: Record<SpotId, PlaceText>;
  catalog: Catalog | undefined;
  error?: string;
}) {
  const style: Record<string, string> = {};
  if (wide.board) {
    const [x, y, w, h] = wide.board;
    style['--bx'] = pct(x, wide.w);
    style['--by'] = pct(y, wide.h);
    style['--bw'] = pct(w, wide.w);
    style['--bh'] = pct(h, wide.h);
  }
  return (
    <section
      aria-labelledby="hero-h"
      className={`lp-hero ${variant}`}
      data-board={wide.board ? '' : undefined}
      style={style}
    >
      <Intro catalog={catalog} error={error} />
      <Canvas def={wide} places={places} catalog={catalog} className="lp-wide" />
      <Canvas def={phone} places={places} catalog={catalog} className="lp-phone" />
    </section>
  );
}
