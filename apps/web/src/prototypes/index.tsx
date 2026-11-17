import { useMemo } from 'react';
import { useI18n, type TParams } from '../i18n.tsx';
import { Hero, type PlaceText, type SpotId } from '../landing/stage.tsx';
import { homeHref, type Catalog } from '../lib.ts';
import { overworldDesktop, overworldMobile } from './overworld.tsx';
import { PT_ID } from './strings.ts';
import './prototypes.css';

/*
 * Development reference only. ES28.4 built two landing prototypes; in ES28.5 the owner chose Concept A (Living
 * Library), which is now the production landing page (pages/Home.tsx, src/landing). Concept B (Archive Overworld) is
 * kept here as a reference for later map ideas. App.tsx loads this module lazily, and only when the build sets the
 * prototype flag (always under `vite` dev; VITE_LANDING_PROTOTYPES=1 for a production-like preview). The normal build
 * drops it entirely: it is not in the published bundle, the navigation, the service-worker cache or any export.
 */
export const PROTOTYPE_PATHS = {
  index: '/_prototypes',
  b: '/_prototypes/archive-overworld',
} as const;

/** Prototype translator: its strings live in this chunk (strings.ts), never in the production locale file. */
export function usePt() {
  const { lang, t } = useI18n();
  return (text: string, params?: TParams) =>
    lang === 'id' && PT_ID[text] ? t(PT_ID[text]!, params) : t(text, params);
}

function PrototypeNote() {
  const pt = usePt();
  return (
    <p className="lp-proto-note">
      {pt('Development reference: Concept B was not selected. The landing page is Concept A.')}{' '}
      <a href={`${homeHref().replace(/\/$/, '')}${PROTOTYPE_PATHS.index}`}>
        {pt('All prototypes')}
      </a>
    </p>
  );
}

export function ArchiveOverworld({ catalog }: { catalog: Catalog | undefined }) {
  const pt = usePt();
  const wide = useMemo(() => overworldDesktop(), []);
  const phone = useMemo(() => overworldMobile(), []);
  const skills = (n: number) => (n === 1 ? pt('{n} skill', { n }) : pt('{n} skills', { n }));
  const places: Record<SpotId, PlaceText> = {
    skills: { name: pt('Skill Library'), count: skills, action: pt('Browse skills') },
    resources: {
      name: pt('Tool Workshop'),
      count: (n) => pt('{n} resources', { n }),
      action: pt('Explore resources'),
    },
    sources: {
      name: pt('Source Archive'),
      count: (n) => pt('{n} sources', { n }),
      action: pt('View sources'),
    },
    ecosystem: { name: pt('Guild Hall'), count: skills, action: pt('Explore FM Ecosystem skills') },
  };
  return (
    <div className="lp-root">
      <PrototypeNote />
      <Hero variant="lp-b" wide={wide} phone={phone} places={places} catalog={catalog} />
    </div>
  );
}

function Index() {
  const pt = usePt();
  const base = homeHref().replace(/\/$/, '');
  return (
    <div className="lp-root lp-index">
      <h1 className="lp-title">{pt('Landing prototypes')}</h1>
      <p className="lp-proto-note">
        {pt(
          'Development preview only. Not linked from the site, not in the production build and not cached for offline use.',
        )}
      </p>
      <ul>
        <li>
          <a href={homeHref()}>{pt('Concept A: Living Library (the landing page)')}</a>
        </li>
        <li>
          <a href={`${base}${PROTOTYPE_PATHS.b}`}>
            {pt('Concept B: Archive Overworld (reference)')}
          </a>
        </li>
      </ul>
    </div>
  );
}

export default function LandingPrototype({
  which,
  catalog,
}: {
  which: 'index' | 'b';
  catalog: Catalog | undefined;
}) {
  return which === 'b' ? <ArchiveOverworld catalog={catalog} /> : <Index />;
}
