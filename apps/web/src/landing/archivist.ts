import { ARCHIVIST } from '../art.tsx';

/*
 * ES28.4: the Archivist at the scenes' own pixel scale. A faithful 32 × 48 rendition of the canonical 16 × 24 sprite
 * (art.tsx ARCHIVIST): the same pointed hood, open face with two dot eyes and blush, the glowing ledger held in both
 * hands, the robe with its shaded hem and the two boots, in the same palette letters (so the same colours in both
 * themes). Each row of the original maps to two rows here; outlines stay one pixel, as in every other scene object.
 */
export const ARCHIVIST_LARGE: readonly string[] = [
  '...............oo...............',
  '..............ohho..............',
  '.............ohhhho.............',
  '............ohhhhhho............',
  '...........ohhhhhhhho...........',
  '..........ohhhhhhhhhho..........',
  '.........ohhhhhhhhhhhho.........',
  '........ohhhhhhhhhhhhhho........',
  '.......ohhhhhhhhhhhhhhhho.......',
  '......ohhhhhhhhhhhhhhhhhho......',
  '.....ohhhhhhhhhhhhhhhhhhhho.....',
  '....ohhhhhhhhhhhhhhhhhhhhhho....',
  '....ohhhhhHHHHHHHHHHHHhhhhho....',
  '....ohhhhHHkkkkkkkkkkHHhhhho....',
  '....ohhhHHkkkkkkkkkkkkHHhhho....',
  '....ohhhHkkkkkkkkkkkkkkHhhho....',
  '....ohhhHkkkeekkkkeekkkHhhho....',
  '....ohhhHkkkeekkkkeekkkHhhho....',
  '....ohhhHkkrrkkkkkkrrkkHhhho....',
  '....ohhhHkkkkkkkkkkkkkkHhhho....',
  '....ohhhHHkkkkkkkkkkkkHHhhho....',
  '....ohhhhHHKKKKKKKKKKHHhhhho....',
  '....ohhhhhHHHHHHHHHHHHhhhhho....',
  '....ohhhhhhhhhhhhhhhhhhhhhho....',
  '..ohhhhhhhhhhhhhhhhhhhhhhhhhho..',
  '..ohhhhhhhhhhhhhhhhhhhhhhhhhho..',
  '..ohhhGggggggggggggggggggGhhho..',
  '..ohkkpppppppppPPpppppppppkkho..',
  '..ohkkpPPPPPPPpPPpPPPPPPPpkkho..',
  '..ohkkpppppppppPPpppppppppkkho..',
  '..ohkkpPPPPPpppPPpPPPPPPppkkho..',
  '..ohKKpppppppppPPpppppppppKKho..',
  '..ohhhpPPPPPPPpPPpPPPPPPpphhho..',
  '..ohhhpppppppppPPppppppppphhho..',
  '..ohhhllllllllllllllllllllhhho..',
  '..ohhhLLLLLLLLLLLLLLLLLLLLhhho..',
  '..ohhhhhhhhhhhhhhhhhhhhhhhhhho..',
  '..ohhhhhhhhhhhhhhhhhhhhhhhhhho..',
  '..oHHhhhhhhhhhhhhhhhhhhhhhhHHo..',
  '..oHHhhhhhhhhhhhhhhhhhhhhhhHHo..',
  '..oHHHHhhhhhhhhhHhhhhhhhhHHHHo..',
  '..oHHHHhhhhhhhhhHhhhhhhhhHHHHo..',
  '....oHHHHHHHHHHHHHHHHHHHHHHo....',
  '....oooooooooooooooooooooooo....',
  '......ollllllo....ollllllo......',
  '......oLLLLLLo....oLLLLLLo......',
  '......oLLLLLLo....oLLLLLLo......',
  '......oooooooo....oooooooo......',
];

/** The canonical sprite, for the overworld (where it is drawn at its own native 16 × 24). */
export { ARCHIVIST };

type Patch = readonly (readonly [number, number, string])[];

/** Eyes (2 × 2 each) at x 12–13 and 18–19, rows 16–17. */
const eyesAt = (dx: number): Patch =>
  [12, 13, 18, 19].flatMap((x) => [
    [x + dx, 16, 'e'],
    [x + dx, 17, 'e'],
  ]) as unknown as Patch;
/** Skin over the default eyes, so a look or a blink can be drawn on top. */
export const EYES_OFF: Patch = [12, 13, 18, 19].flatMap((x) => [
  [x, 16, 'k'],
  [x, 17, 'k'],
]) as unknown as Patch;
export const EYES_LEFT = eyesAt(-1);
export const EYES_RIGHT = eyesAt(1);
/** Blink: the eyes become a closed line on the lower row. */
export const BLINK: Patch = [
  ...EYES_OFF,
  ...([12, 13, 18, 19].map((x) => [x, 17, 'e']) as unknown as Patch),
];
/** Glow: the light over the ledger shimmers, and a few sparks rise above it. */
export const GLOW: Patch = [
  ...Array.from({ length: 20 }, (_, i) => [6 + i, 26, i % 2 ? 'G' : 'g'] as const),
  [10, 25, 'G'],
  [15, 24, 'g'],
  [21, 25, 'G'],
];
/** Attend: the ledger shines fully when a destination is chosen. */
export const ATTEND: Patch = [
  ...Array.from({ length: 20 }, (_, i) => [6 + i, 26, 'G'] as const),
  [8, 25, 'g'],
  [12, 24, 'G'],
  [16, 23, 'g'],
  [19, 24, 'G'],
  [23, 25, 'g'],
];
