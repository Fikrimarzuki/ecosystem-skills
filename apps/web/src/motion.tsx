import { useEffect, useState } from 'react';
import { useT } from './i18n.tsx';

/*
 * Animation setting (ES28). Two inputs decide whether decorative art moves:
 *   - the site setting, stored in localStorage ('motion': 'on' | 'off', default 'on');
 *   - the device's reduced-motion preference, which always wins.
 * The effective state is written to <html data-motion="on|off">; every decorative animation in index.css is keyed to
 * data-motion="on", so the catalog never depends on it. index.html sets the attribute before the first paint.
 */
export type MotionPref = 'on' | 'off';
export const MOTION_KEY = 'motion';

export function readMotionPref(store: Pick<Storage, 'getItem'> | null | undefined): MotionPref {
  try {
    return store?.getItem(MOTION_KEY) === 'off' ? 'off' : 'on';
  } catch {
    return 'on';
  }
}

/** Animation runs only when the site setting is on and the device does not ask for reduced motion. */
export const effectiveMotion = (pref: MotionPref, systemReduced: boolean): MotionPref =>
  pref === 'on' && !systemReduced ? 'on' : 'off';

const reducedQuery = () =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;

export function MotionToggle() {
  const t = useT();
  const [pref, setPref] = useState<MotionPref>(() =>
    readMotionPref(typeof localStorage === 'undefined' ? null : localStorage),
  );
  const [reduced, setReduced] = useState(() => reducedQuery()?.matches ?? false);
  useEffect(() => {
    const q = reducedQuery();
    if (!q) return;
    const on = () => setReduced(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  const state = effectiveMotion(pref, reduced);
  useEffect(() => {
    document.documentElement.dataset.motion = state;
  }, [state]);

  const label = reduced
    ? t('Animation is off because your device asks for reduced motion')
    : state === 'on'
      ? t('Turn animation off')
      : t('Turn animation on');
  return (
    <button
      type="button"
      aria-pressed={state === 'on'}
      aria-disabled={reduced || undefined}
      aria-label={label}
      title={label}
      onClick={() => {
        if (reduced) return;
        const next: MotionPref = pref === 'on' ? 'off' : 'on';
        setPref(next);
        try {
          localStorage.setItem(MOTION_KEY, next);
        } catch {
          /* storage unavailable: the choice lasts for this visit only */
        }
      }}
      className="cw-tool aria-disabled:cursor-not-allowed"
    >
      <MotionIcon on={state === 'on'} />
      <span className="sr-only sm:not-sr-only">
        {state === 'on' ? t('Animation: on') : t('Animation: off')}
      </span>
    </button>
  );
}

/** A small pixel "spark": filled when animation is on, hollow when it is off. */
function MotionIcon({ on }: { on: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      {on ? (
        <path d="M3 0h1v2H3zM3 5h1v2H3zM0 3h2v1H0zM5 3h2v1H5zM2 2h3v3H2z" />
      ) : (
        <path d="M3 0h1v2H3zM3 5h1v2H3zM0 3h2v1H0zM5 3h2v1H5zM2 2h3v1H2zM2 4h3v1H2zM2 3h1v1H2zM4 3h1v1H4z" />
      )}
    </svg>
  );
}
