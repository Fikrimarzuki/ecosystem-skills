import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Archivist } from '../art.tsx';
import { useT, type T } from '../i18n.tsx';
import type { Catalog, Route } from '../lib.ts';
import { companion, lineOf, useCompanion } from './companion.tsx';
import { reactionOf, type Reaction } from './reactions.ts';
import { Scene } from './scene.tsx';
import './adventure.css';

/*
 * ES29.4 Archivist's Little Adventure: one floating pixel window, mounted once by the app shell, so it is the same
 * window (same place, same state) on every page. It plays the idle adventure (scene.tsx) and shows the Archivist's
 * reactions to skills (companion.tsx).
 *
 * Controls: drag by the title bar (mouse, pen or touch); arrow keys on the move handle (Shift = bigger steps); pin to
 * lock the window where it is; reset to the bottom-right corner; minimize to a small launcher in the bottom-right
 * corner, which restores it. Escape inside the window minimizes it. The window is a non-modal region: it never traps
 * focus and never blocks scrolling. It is always kept inside the viewport and below the site header, and the
 * minimize button and the launcher are always reachable, so it can never get lost.
 *
 * Remembered in localStorage ('adventure'): position, pinned, minimized. Without a stored choice it opens expanded
 * on desktop widths and minimized on phones and tablets.
 */

const KEY = 'adventure';
interface Prefs {
  x?: number;
  y?: number;
  pinned: boolean;
  min: boolean;
}

function readPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Prefs> | null;
    if (v && typeof v === 'object' && typeof v.min === 'boolean') {
      const placed = Number.isFinite(v.x) && Number.isFinite(v.y);
      return {
        pinned: v.pinned === true,
        min: v.min,
        ...(placed ? { x: v.x, y: v.y } : {}),
      };
    }
  } catch {
    /* storage unavailable or malformed: fall back to the defaults */
  }
  const desktop = typeof matchMedia === 'function' && matchMedia('(min-width: 1024px)').matches;
  return { pinned: false, min: !desktop };
}

const MARGIN = 8;
/** Keep the whole window inside the viewport, and its title bar below the sticky site header. */
function clampPos(el: HTMLElement, x: number, y: number) {
  const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
  const top = Math.max(MARGIN, Math.round(header) + MARGIN);
  const maxX = Math.max(MARGIN, window.innerWidth - el.offsetWidth - MARGIN);
  const maxY = Math.max(top, window.innerHeight - el.offsetHeight - MARGIN);
  return {
    x: Math.round(Math.min(Math.max(x, MARGIN), maxX)),
    y: Math.round(Math.min(Math.max(y, top), maxY)),
  };
}

/** A short contextual reaction when a page opens. The Skills page reacts to its own filters and branches instead. */
function pageCue(
  route: Route,
  catalog: Catalog | undefined,
  t: T,
): { reaction: Reaction; label: string } | undefined {
  switch (route.page) {
    case 'home':
      return { reaction: 'ledger', label: t('Home') };
    case 'dashboard':
      return { reaction: 'map', label: t('Overview') };
    case 'skill': {
      const s = catalog?.skills.find((x) => x.id === route.id);
      return s && { reaction: reactionOf(s), label: s.name };
    }
    case 'resources':
      return { reaction: 'map', label: t('Resources') };
    case 'resource': {
      const r = catalog?.resources.find((x) => x.id === route.id);
      return r && { reaction: 'lens', label: r.name };
    }
    case 'sources':
      return { reaction: 'book', label: t('Sources') };
    case 'ecosystem':
      return { reaction: 'ledger', label: t('FM Ecosystem') };
    case 'consumers':
      return { reaction: 'ledger', label: t('Consumers') };
    case 'integrations':
      return { reaction: 'code', label: t('Agents & tools') };
    default:
      return undefined;
  }
}

/* Pixel icons, 7 × 7, in the current text colour. */
const Icon = ({ d }: { d: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 7 7"
    shapeRendering="crispEdges"
    aria-hidden="true"
    focusable="false"
    fill="currentColor"
  >
    <path d={d} />
  </svg>
);
const GRIP = 'M1 0h2v2H1zM4 0h2v2H4zM1 3h2v1H1zM4 3h2v1H4zM1 5h2v2H1zM4 5h2v2H4z';
const PIN_ON = 'M2 0h3v1H2zM1 1h5v2H1zM0 3h7v1H0zM3 4h1v3H3z';
const PIN_OFF = 'M2 0h3v1H2zM1 1h1v2H1zM5 1h1v2H5zM0 3h7v1H0zM3 4h1v3H3z';
const RESET = 'M0 0h4v1H1v3H0zM2 2h1v1H2zM3 3h1v1H3zM6 3h1v4H3V6h3z';
const MINIMIZE = 'M0 5h7v2H0z';

export function Adventure({ route, catalog }: { route: Route; catalog: Catalog | undefined }) {
  const t = useT();
  const s = useCompanion();
  const ids = useId();
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const win = useRef<HTMLElement>(null);
  const launch = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const minBtn = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<'launcher' | 'window' | null>(null);
  const placed = prefs.x !== undefined && prefs.y !== undefined;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable: the choice lasts for this visit only */
    }
  }, [prefs]);

  // After minimize or restore, keep keyboard focus with the control that replaced the one just pressed.
  useEffect(() => {
    if (focusNext.current === 'launcher') launcher.current?.focus();
    if (focusNext.current === 'window') minBtn.current?.focus();
    focusNext.current = null;
  }, [prefs.min]);

  // Keep a placed window inside the viewport when the viewport changes (and when the window is restored).
  useEffect(() => {
    if (prefs.min) return;
    const fit = () =>
      setPrefs((p) => {
        if (p.x === undefined || p.y === undefined || !win.current) return p;
        const c = clampPos(win.current, p.x, p.y);
        return c.x === p.x && c.y === p.y ? p : { ...p, ...c };
      });
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [prefs.min]);

  // A hidden tab pauses every animation (a data attribute, no re-render).
  useEffect(() => {
    const sync = () => {
      for (const el of [win.current, launch.current])
        el?.toggleAttribute('data-hidden', document.hidden);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [prefs.min]);

  // Each page says hello in its own way; the Skills page reacts to its filters and tree branches itself.
  const cue = useMemo(() => pageCue(route, catalog, t), [route, catalog, t]);
  useEffect(() => {
    if (cue) companion.pulse(cue.reaction, cue.label);
  }, [cue?.reaction, cue?.label]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- dragging: the style is moved directly while dragging and saved once on release */
  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const el = win.current;
    if (!el || prefs.pinned || e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest('button:not(.adv-grip)')) return;
    // A finger on the scene scrolls the page; touch dragging uses the grip in the toolbar.
    if (e.pointerType === 'touch' && !target.closest('.adv-grip')) return;
    const bar = e.currentTarget;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    let last: { x: number; y: number } | undefined;
    bar.setPointerCapture(e.pointerId);
    el.toggleAttribute('data-dragging', true);
    const move = (ev: PointerEvent) => {
      last = clampPos(el, ev.clientX - dx, ev.clientY - dy);
      el.toggleAttribute('data-placed', true);
      el.style.left = `${last.x}px`;
      el.style.top = `${last.y}px`;
    };
    const end = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', end);
      bar.removeEventListener('pointercancel', end);
      el.toggleAttribute('data-dragging', false);
      if (last) {
        const p = last;
        setPrefs((q) => ({ ...q, x: p.x, y: p.y }));
      }
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  };

  /* --- keyboard: arrow keys on the move handle */
  const onMoveKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const d: Partial<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const v = d[e.key];
    const el = win.current;
    if (!v || !el) return;
    e.preventDefault();
    if (prefs.pinned) return;
    const r = el.getBoundingClientRect();
    const c = clampPos(el, r.left + v[0], r.top + v[1]);
    setPrefs((p) => ({ ...p, ...c }));
  };

  const minimize = () => {
    focusNext.current = 'launcher';
    setPrefs((p) => ({ ...p, min: true }));
  };
  const restore = () => {
    focusNext.current = 'window';
    setPrefs((p) => ({ ...p, min: false }));
  };

  if (prefs.min)
    return (
      <div ref={launch} className="adv-launch" data-react={s.reaction}>
        {s.reaction !== 'idle' && s.label && (
          <p key={s.cue} aria-hidden="true" className="adv-launch-bubble">
            {s.label}
          </p>
        )}
        <button
          ref={launcher}
          type="button"
          onClick={restore}
          aria-label={t('Open the Archivist’s adventure')}
          title={t('Open the Archivist’s adventure')}
          className="adv-launcher"
        >
          <Archivist scale={2} />
        </button>
      </div>
    );

  const pinLabel = prefs.pinned ? t('Unpin window') : t('Pin window in place');
  return (
    <aside
      ref={win}
      aria-labelledby={`${ids}-title`}
      className="adv"
      onPointerDown={startDrag}
      data-react={s.reaction}
      data-pinned={prefs.pinned ? '' : undefined}
      data-placed={placed ? '' : undefined}
      style={placed ? { left: prefs.x, top: prefs.y } : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          minimize();
        }
      }}
    >
      <p id={`${ids}-hint`} className="sr-only">
        {t('Use the arrow keys to move the window, Shift for bigger steps. Escape minimizes it.')}
      </p>
      <div className="adv-stage">
        <Scene cue={s.cue} />
        {s.reaction !== 'idle' && (
          <div key={s.cue} aria-hidden="true" className="adv-bubble">
            <p className="adv-bubble-name">{s.label || t('The Archivist')}</p>
            <p className="adv-bubble-line">{lineOf(s.reaction, t)}</p>
          </div>
        )}
      </div>
      <p id={`${ids}-title`} className="sr-only">
        {t('Archivist’s Adventure')}
      </p>
      <p className="sr-only">
        {t(
          'A decorative idle animation: the Archivist strolls along and shoos away friendly monsters. It has no effect on the catalog.',
        )}
      </p>
      <div className="adv-bar">
        <button
          type="button"
          className="adv-btn adv-grip"
          aria-label={t('Move window')}
          aria-describedby={`${ids}-hint`}
          aria-disabled={prefs.pinned || undefined}
          title={t('Move window')}
          onKeyDown={onMoveKey}
        >
          <Icon d={GRIP} />
        </button>
        <button
          type="button"
          className="adv-btn"
          aria-pressed={prefs.pinned}
          aria-label={pinLabel}
          title={pinLabel}
          onClick={() => setPrefs((p) => ({ ...p, pinned: !p.pinned }))}
        >
          <Icon d={prefs.pinned ? PIN_ON : PIN_OFF} />
        </button>
        <button
          type="button"
          className="adv-btn"
          aria-label={t('Reset window position')}
          title={t('Reset window position')}
          onClick={() => setPrefs((p) => ({ pinned: p.pinned, min: p.min }))}
        >
          <Icon d={RESET} />
        </button>
        <button
          ref={minBtn}
          type="button"
          className="adv-btn"
          aria-label={t('Minimize adventure')}
          title={t('Minimize adventure')}
          onClick={minimize}
        >
          <Icon d={MINIMIZE} />
        </button>
      </div>
    </aside>
  );
}
