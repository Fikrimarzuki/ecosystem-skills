import { useSyncExternalStore, type FocusEvent, type PointerEvent, type ReactElement } from 'react';
import type { T } from '../i18n.tsx';
import {
  ARCHIVIST_LARGE,
  ATTEND,
  BLINK,
  EYES_OFF,
  EYES_RIGHT,
  GLOW,
} from '../landing/archivist.ts';
import { Layers, Painter, type Layer } from '../landing/pixel.tsx';
import { REACTIONS, type Reaction } from './reactions.ts';

/*
 * ES29 / ES29.4: the Archivist's reactions, shared by the whole site. The same 32 × 48 sprite as the Living Library,
 * drawn with the same palette letters, so it is the same character in both themes. Each reaction swaps what the hands
 * hold (a code scroll, a quill, a shield, a lens, a book, a map, the ledger); the art for every reaction is built once
 * and shown by CSS from one data attribute, so a reaction never re-renders the sprite.
 *
 * There is exactly one Archivist on screen: the floating adventure window (adventure.tsx) draws this art. Pages only
 * send cues: lists spread CUE_HANDLERS and mark items with data-react / data-label; selections call
 * companion.pulse(). A reaction names the kind of skill (registry classification) and never review, approval,
 * assignment or installation.
 */

/* ------------------------------------------------------------------------------------------- store */

interface State {
  /** 'idle' means the adventure is playing; anything else interrupts it. */
  reaction: Reaction;
  /** Skill, branch or page name for the speech bubble (registry text, as written). */
  label: string;
  /** Increments on every new reaction, so the "!" emote and the bubble replay. */
  cue: number;
}
const IDLE: State = { reaction: 'idle', label: '', cue: 0 };
let state: State = IDLE;
let pending: ReturnType<typeof setTimeout> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const snapshot = () => state;

/** How long a reaction interrupts the adventure, at most, and how soon it ends once hover or focus leaves. */
const HOLD_MS = 2600;
const PULSE_MS = 2400;
const LEAVE_MS = 700;

function show(reaction: Reaction, label: string, ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (state.reaction === 'idle') return;
    state = { ...IDLE, cue: state.cue };
    emit();
  }, ms);
  if (state.reaction === reaction && state.label === label) return;
  state = { reaction, label, cue: state.cue + 1 };
  emit();
}

export const companion = {
  /**
   * A skill is hovered or focused. Debounced: sweeping the pointer across a row of cards shows only the card it
   * settles on, so the Archivist never flickers between props.
   */
  cue(reaction: Reaction, label: string) {
    clearTimeout(pending);
    pending = setTimeout(
      () => show(reaction, label, HOLD_MS),
      state.reaction === 'idle' ? 140 : 70,
    );
  },
  /** Hover or focus left: back to the adventure shortly. */
  rest() {
    clearTimeout(pending);
    if (state.reaction === 'idle') return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      state = { ...IDLE, cue: state.cue };
      emit();
    }, LEAVE_MS);
  },
  /** A choice was made (a category filter, a tree branch, a page): react once, briefly. Works on touch screens. */
  pulse(reaction: Reaction, label: string) {
    clearTimeout(pending);
    show(reaction, label, PULSE_MS);
  },
};

/** The current reaction; re-renders only when a reaction starts or ends. */
export const useCompanion = () => useSyncExternalStore(subscribe, snapshot, snapshot);

const isReaction = (v: string | undefined): v is Reaction =>
  !!v && (REACTIONS as readonly string[]).includes(v);

/** The element that carries a reaction: the hovered item itself, or the item (card, row, leaf) it sits in. */
function reactor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return (target.closest('[data-react]') ??
    target.closest('li, tr')?.querySelector('[data-react]') ??
    null) as HTMLElement | null;
}
function cueFrom(target: EventTarget | null) {
  const el = reactor(target);
  const r = el?.dataset.react;
  if (isReaction(r)) companion.cue(r, el!.dataset.label ?? '');
}

/**
 * Delegated handlers for a whole list (one set per list, not per card): put `data-react` and `data-label` on each
 * item. The same object every render. A touch does not count as hover (the tap opens the skill anyway); touch
 * screens get reactions from selections instead (companion.pulse).
 */
export const CUE_HANDLERS = {
  onPointerOver: (e: PointerEvent) => {
    if (e.pointerType !== 'touch') cueFrom(e.target);
  },
  onPointerLeave: () => companion.rest(),
  onFocus: (e: FocusEvent) => cueFrom(e.target),
  onBlur: (e: FocusEvent) => {
    if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget))
      companion.rest();
  },
};

/* ------------------------------------------------------------------------------------------ sprite */

type Pt = readonly [number, number, string];
/** A filled rectangle of one palette letter, as single pixels for Painter.patch. */
const rect = (x: number, y: number, w: number, h: number, c: string): Pt[] =>
  Array.from({ length: w * h }, (_, i) => [x + (i % w), y + Math.floor(i / w), c] as const);
const px = (...pts: Pt[]): Pt[] => pts;
const paint = (...parts: (Pt[] | readonly Pt[])[]) => new Painter().patch(0, 0, parts.flat());
const grid = (x: number, y: number, rows: readonly string[]) => new Painter().grid(x, y, rows);

/** Robe over the ledger (columns 6–25, rows 26–35); the hands at either side stay. */
const ERASE = rect(6, 26, 20, 10, 'h');
/** Eyes lowered to what the hands hold. */
const EYES_DOWN: Pt[] = [
  ...EYES_OFF,
  ...[12, 13, 18, 19].flatMap((x) => px([x, 17, 'e'], [x, 18, 'e'])),
];

/** Coding: an unrolled scroll with a "</>" on it, a roller in each hand. */
const SCROLL = [
  ...ERASE,
  ...rect(6, 25, 2, 1, 'o'),
  ...rect(6, 26, 2, 9, 'l'),
  ...rect(6, 35, 2, 1, 'o'),
  ...rect(24, 25, 2, 1, 'o'),
  ...rect(24, 26, 2, 9, 'l'),
  ...rect(24, 35, 2, 1, 'o'),
  ...rect(8, 26, 16, 1, 'o'),
  ...rect(8, 27, 16, 7, 'p'),
  ...rect(8, 34, 16, 1, 'o'),
  ...rect(10, 28, 9, 1, 'P'),
  ...px([11, 29, 's'], [10, 30, 's'], [11, 31, 's']),
  ...px([16, 29, 's'], [15, 30, 's'], [14, 31, 's']),
  ...px([19, 29, 's'], [20, 30, 's'], [19, 31, 's']),
  ...rect(10, 32, 5, 1, 'P'),
  ...rect(16, 32, 5, 1, 'S'),
];
const SCROLL_SPARK_A = px([9, 23, 'g'], [22, 24, 'G']);
const SCROLL_SPARK_B = px([12, 24, 'G'], [20, 22, 'g']);

/** Design: a sheet in the left hand with a sketched wave, a quill in the right hand drawing it. */
const SHEET = [
  ...ERASE,
  ...rect(6, 27, 15, 1, 'o'),
  ...rect(6, 28, 15, 7, 'p'),
  ...rect(6, 35, 15, 1, 'P'),
  ...px([8, 31, 's'], [9, 30, 's'], [10, 30, 's'], [11, 31, 's'], [12, 32, 's'], [13, 32, 's']),
];
const quill = (dx: number, dy: number) => [
  ...px(
    [24 + dx, 26 + dy, 'o'],
    [23 + dx, 27 + dy, 'o'],
    [22 + dx, 28 + dy, 'o'],
    [21 + dx, 29 + dy, 'o'],
    [20 + dx, 30 + dy, 'o'],
    [19 + dx, 31 + dy, 'o'],
    [18 + dx, 32 + dy, 'e'],
  ),
  ...rect(26 + dx, 20 + dy, 2, 1, 'p'),
  ...rect(25 + dx, 21 + dy, 3, 1, 'p'),
  ...rect(25 + dx, 22 + dy, 3, 1, 'p'),
  ...rect(24 + dx, 23 + dy, 3, 1, 'p'),
  ...rect(24 + dx, 24 + dy, 3, 1, 'P'),
  ...rect(24 + dx, 25 + dy, 2, 1, 'P'),
];
const INK_A = px([14, 31, 's'], [15, 30, 's']);

/** Security: a teal shield with a gold crest, held on leather straps. */
const SHIELD_ROWS = [
  'oooooooooooooo',
  'opssssssssssSo',
  'opsssssggsssSo',
  'osssssggggssSo',
  'osssgggggggsSo',
  'osssssggggssSo',
  'osssssgsgsssSo',
  '.ossssssssSSo.',
  '.osssssssSSSo.',
  '..osssssSSSo..',
  '...ossssSSo...',
  '....osSSSo....',
  '.....oooo.....',
];
const STRAPS = [...rect(6, 29, 3, 1, 'l'), ...rect(23, 29, 3, 1, 'l')];
const GLINT_A = px([11, 26, 'p'], [12, 25, 'p']);
const GLINT_B = px([18, 30, 'p'], [19, 29, 'p']);

/** Testing and review: a brass lens raised to the right eye (which looks huge through it), the ledger closed. */
const LENS_ROWS = [
  '..oooooo..',
  '.oggggggo.',
  'ogpkkkkkgo',
  'ogkkeeekgo',
  'ogkkeeekgo',
  'ogkkeeekgo',
  'ogkkkkkkgo',
  '.ogkkkkgo.',
  '..oGGGGo..',
  '...oooo...',
];
const LENS_HANDLE = [
  ...rect(24, 21, 2, 1, 'l'),
  ...rect(25, 22, 2, 2, 'l'),
  ...rect(26, 24, 2, 3, 'L'),
];
const CLOSED_BOOK = [
  ...ERASE,
  ...rect(5, 27, 9, 1, 'o'),
  ...rect(5, 28, 1, 7, 'o'),
  ...rect(13, 28, 1, 7, 'o'),
  ...rect(5, 35, 9, 1, 'o'),
  ...rect(6, 28, 7, 7, 'l'),
  ...rect(7, 30, 5, 1, 'g'),
  ...rect(6, 34, 7, 1, 'L'),
];

/** Documentation: a big open book with a ribbon, read with lowered eyes; a page turns now and then. */
const BOOK_ROWS = [
  'oooooooooooooooooooo',
  'oppppppppoopppppppPo',
  'opPPPPPPpoopPPPPPpPo',
  'oppppppppoopppppppPo',
  'opPPPPPppoopPPPPPPPo',
  'oppppppppoopppppppPo',
  'opPPPPPPpoopPPPPppPo',
  'oppppppppoopppppppPo',
  'olllllllllLLlllllllo',
  'oooooooooooooooooooo',
];
const RIBBON = rect(15, 36, 1, 2, 'r');
const PAGE_TURN = [
  ...rect(16, 25, 2, 1, 'p'),
  ...rect(18, 24, 3, 1, 'p'),
  ...rect(21, 23, 3, 1, 'p'),
  ...rect(18, 25, 3, 1, 'P'),
  ...rect(21, 24, 3, 1, 'P'),
  ...px([24, 24, 'o'], [24, 23, 'o']),
];

/** Planning: an unfolded map with a dotted route to an X. */
const MAP = [
  ...ERASE,
  ...rect(6, 26, 20, 1, 'o'),
  ...rect(6, 35, 20, 1, 'o'),
  ...rect(6, 27, 1, 8, 'o'),
  ...rect(25, 27, 1, 8, 'o'),
  ...rect(7, 27, 18, 8, 'p'),
  ...rect(12, 27, 1, 8, 'P'),
  ...rect(19, 27, 1, 8, 'P'),
  ...px([8, 33, 's'], [9, 32, 's'], [11, 32, 's'], [13, 31, 's'], [14, 30, 's'], [16, 30, 's']),
  ...px([18, 29, 's'], [20, 29, 's']),
];
const MAP_X = px([21, 27, 'r'], [23, 27, 'r'], [22, 28, 'r'], [21, 29, 'r'], [23, 29, 'r']);

/** The RPG "!" above the hood, on every new cue. */
const EMOTE_ROWS = [
  '.ooooooo.',
  'opppoppPo',
  'opppoppPo',
  'opppoppPo',
  'oppppppPo',
  'opppoppPo',
  '.ooooooo.',
  '.oo......',
];

const BOOT_ROWS = ARCHIVIST_LARGE.slice(44);

/** Every layer of the companion, built once. CSS (codex.css) shows the one for the current reaction. */
function spriteLayers(): Layer[] {
  const r = (name: Reaction, kids: Layer[]): Layer => ({ cls: `sx-r sx-r-${name}`, kids });
  return [
    {
      cls: 'sx-bob',
      kids: [
        { p: grid(0, 0, ARCHIVIST_LARGE.slice(0, 44)) },
        {
          cls: 'sx-boot-l',
          p: grid(
            0,
            44,
            BOOT_ROWS.map((row) => row.slice(0, 16)),
          ),
        },
        {
          cls: 'sx-boot-r',
          p: grid(
            16,
            44,
            BOOT_ROWS.map((row) => row.slice(16)),
          ),
        },
        // idle: the ledger glows and the Archivist reads it now and then; blinks only while idle
        r('idle', [
          { cls: 'sx-glow', p: paint(GLOW) },
          { cls: 'sx-cast', p: paint(ATTEND) },
          { cls: 'sx-read', p: paint(EYES_DOWN) },
          { cls: 'sx-blink', p: paint(BLINK) },
        ]),
        r('code', [
          { p: paint(SCROLL, EYES_DOWN) },
          { cls: 'sx-fa', p: paint(SCROLL_SPARK_A) },
          { cls: 'sx-fb', p: paint(SCROLL_SPARK_B) },
        ]),
        r('quill', [
          { p: paint(SHEET, EYES_DOWN) },
          { cls: 'sx-fa', p: paint(quill(0, 0)) },
          { cls: 'sx-fb', p: paint(quill(-2, 1), INK_A) },
        ]),
        r('shield', [
          { p: paint(ERASE, STRAPS, EYES_DOWN).grid(9, 24, SHIELD_ROWS) },
          { cls: 'sx-fa', p: paint(GLINT_A) },
          { cls: 'sx-fb', p: paint(GLINT_B) },
        ]),
        r('lens', [
          { p: paint(CLOSED_BOOK, EYES_OFF, EYES_RIGHT) },
          { cls: 'sx-fa', p: paint(LENS_HANDLE).grid(16, 11, LENS_ROWS) },
          {
            cls: 'sx-fb',
            p: paint(LENS_HANDLE.map(([x, y, c]) => [x, y + 1, c] as const)).grid(
              16,
              12,
              LENS_ROWS,
            ),
          },
        ]),
        r('book', [
          { p: paint(ERASE, RIBBON, EYES_DOWN).grid(6, 26, BOOK_ROWS) },
          { cls: 'sx-fb', p: paint(PAGE_TURN) },
        ]),
        r('map', [{ p: paint(MAP, EYES_DOWN) }, { cls: 'sx-fa', p: paint(MAP_X) }]),
        r('ledger', [{ p: paint(ATTEND, EYES_DOWN) }]),
      ],
    },
  ];
}

/* The static art as one element, created on first use: React skips re-rendering an identical element, so a new cue
   only replays the emote. */
let layers: ReactElement | undefined;
/** The Archivist with every pose and reaction, at 32 × 48 from (0, 0). Built once and reused as the same element. */
export const archivistArt = () => (layers ??= <Layers layers={spriteLayers()} />);
let emote: ReactElement | undefined;
/** The RPG "!" bubble, 9 × 8 from (0, 0); place it with a transform. */
export const emoteArt = () => (emote ??= <Layers layers={[{ p: grid(0, 0, EMOTE_ROWS) }]} />);

/* ---------------------------------------------------------------------------------------- speech */

/** What the Archivist says it is doing, under the name in the speech bubble. */
export function lineOf(r: Reaction, t: T): string {
  switch (r) {
    case 'code':
      return t('Unrolling a code scroll…');
    case 'quill':
      return t('Sketching with my quill…');
    case 'shield':
      return t('Examining the shield…');
    case 'lens':
      return t('Taking a closer look…');
    case 'book':
      return t('Reading up on it…');
    case 'map':
      return t('Unfolding the plans…');
    case 'ledger':
      return t('Checking the ledger…');
    default:
      return '';
  }
}
