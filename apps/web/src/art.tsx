import type { CSSProperties } from 'react';

/*
 * Command Window art (ES28). Every sprite is an original, palette-indexed text grid, drawn as inline SVG with
 * `shape-rendering: crispEdges`, so there is nothing to download, nothing to cache separately and nothing remote.
 *
 * Grid rules (docs/command-window-design.md, "Sprites"):
 *   '.'        transparent
 *   lowercase  a palette index, drawn with the CSS variable --px-<letter>
 *   UPPERCASE  the shade of that index, drawn with --px-<letter>2
 * Light and dark themes swap the variables, never the art. All art is decorative: it is aria-hidden, never focusable
 * and never the only place a fact appears.
 */

export type Grid = readonly string[];

/** The Archivist: a friendly hooded keeper of records, holding an open, glowing ledger. 16 × 24 at native size. */
export const ARCHIVIST: Grid = [
  '.......oo.......',
  '......ohho......',
  '.....ohhhho.....',
  '....ohhhhhho....',
  '...ohhhhhhhho...',
  '..ohhhHHHHhhho..',
  '..ohhHkkkkHhho..',
  '..ohHkkkkkkHho..',
  '..ohHkekkekHho..',
  '..ohHkrkkrkHho..',
  '..ohhHkkkkHhho..',
  '..ohhhHHHHhhho..',
  '.ohhhhhhhhhhhho.',
  '.ohGggggggggGho.',
  '.okppppPPppppko.',
  '.okpPPpPPpPPpko.',
  '.ohppppPPpppPho.',
  '.ohllllllllllho.',
  '.ohhhhhhhhhhhho.',
  '.oHhhhhhhhhhhHo.',
  '.oHHhhhhhhhhHHo.',
  '..oHHHHHHHHHHo..',
  '...oLLo..oLLo...',
  '...oooo..oooo...',
];

/** Pixels that change between frames, as [x, y, palette letter]. Drawn over the base grid. */
type Patch = readonly (readonly [number, number, string])[];
/** Blink: both eyes close. */
const BLINK: Patch = [
  [6, 8, 'k'],
  [9, 8, 'k'],
];
/** Glow: the light over the ledger shimmers (alternating bright and soft pixels). */
const GLOW: Patch = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
  (x) => [x, 13, x % 2 ? 'G' : 'g'] as const,
);

/** Replace whole rows of a grid, so every pose keeps the base proportions (16 × 24) and every unchanged row. */
function withRows(base: Grid, rows: Record<number, string>): Grid {
  return base.map((row, y) => rows[y] ?? row);
}

/**
 * ES28.2 poses. Head (rows 0–11), robe (12–21) and boots (22–23) stay the base Archivist's; only what the hands
 * hold, and the face where it tells the story, changes.
 *   searching: holds a magnifying lens to one eye, the ledger closed under the other arm (discovery);
 *   offline:   the ledger is put away and a small lantern lights a saved copy (offline notice);
 *   lost:      a raised brow, an "o" mouth and an open map held up (no results, page not found).
 */
export const POSES = {
  idle: ARCHIVIST,
  searching: withRows(ARCHIVIST, {
    7: '..ohHkkkooooho..',
    8: '..ohHkekoeeoho..',
    9: '..ohHkrkoppoho..',
    10: '..ohhHkkooooho..',
    11: '..ohhhHHHHhLho..',
    12: '.ohhhhhhhhhkkho.',
    13: '.ohhhhhhhhhhhho.',
    14: '.olllohhhhhhhho.',
    15: '.olglohhhhhhhho.',
    16: '.olllohhhhhhhho.',
    17: '.oooohhhhhhhhho.',
  }),
  offline: withRows(ARCHIVIST, {
    12: '.ohhhhhoohhhhho.',
    13: '.ohhhhoggohhhho.',
    14: '.ohhhkoGgokhhho.',
    15: '.ohhhhoggohhhho.',
    16: '.ohhhhhoohhhhho.',
    17: '.ohhhhhhhhhhhho.',
  }),
  lost: withRows(ARCHIVIST, {
    7: '..ohHkkkkokHho..',
    10: '..ohhHkkokHhho..',
    13: '.okooooooooooko.',
    14: '.okopspspspsoko.',
    15: '.okosppssppsoko.',
    16: '.ohopspspspsoho.',
    17: '.ohooooooooooho.',
  }),
} as const satisfies Record<string, Grid>;
export type Pose = keyof typeof POSES;

/** Small glyphs: categories, catalog sections and the brand. Each reads at 2× (16–22 px on screen). */
export const GLYPHS = {
  Coding: [
    '...........',
    '..o...o.o..',
    '.o....o..o.',
    'o....o....o',
    '.o..o....o.',
    '..o.o...o..',
    '...........',
  ],
  Design: [
    '......oo',
    '.....ogo',
    '....ogo.',
    '...ogo..',
    '..oLo...',
    '.oLLo...',
    'oLLo....',
    'oo......',
  ],
  Planning: ['oooooooo', 'ossppsso', 'ossppsso', 'osppsspo', 'ossppsso', 'oooooooo'],
  Communication: [
    'oooooooo',
    'oppppppo',
    'opggpppo',
    'oppppppo',
    'oooooooo',
    '.oo.....',
    '.o......',
  ],
  Verification: [
    '.oooo...',
    'oppgso..',
    'opppso..',
    'osssSo..',
    '.ooooo..',
    '.....oo.',
    '......oo',
  ],
  'Project-specific': [
    'o.......',
    'oggggggo',
    'oggggggo',
    'oggggggo',
    'o.......',
    'o.......',
    'o.......',
  ],
  Other: ['oooooooo', 'oLoLLoLo', 'oLLooLLo', 'oLLooLLo', 'oLoLLoLo', 'oooooooo'],
  ledger: [
    '.oooooooo.',
    'olllllllpo',
    'olggggllpo',
    'olllllllpo',
    'olllllllpo',
    'olllllllpo',
    'olllllllpo',
    '.oooooooo.',
  ],
  satchel: [
    '...oooo...',
    '..o....o..',
    '.oooooooo.',
    'osssssssso',
    'ossgssssso',
    'osssssssso',
    'oSSSSSSSSo',
    '.oooooooo.',
  ],
  shelf: [
    '..........',
    '.oo.oo.oo.',
    '.ol.os.og.',
    '.ol.os.og.',
    '.ol.os.og.',
    'oooooooooo',
    'oLLLLLLLLo',
  ],
  // ES28.2 resource categories: MCP servers, agent development tools, agent references.
  plug: [
    '..o..o..',
    '..o..o..',
    '.oooooo.',
    '.osssso.',
    '.osssso.',
    '..osso..',
    '...oo...',
    '...oo...',
  ],
  hammer: [
    'oooooooo',
    'osssssso',
    'oooooooo',
    '...olo..',
    '...olo..',
    '...olo..',
    '...olo..',
    '...ooo..',
  ],
  book: ['.ooo.ooo.', 'opppopppo', 'opPPoPPpo', 'opppopppo', 'opPPoPPpo', 'opppopppo', '.ooooooo.'],
  // ES28.3 symbols for the remaining pages. Symbols, not characters: an agent is a terminal prompt, a consumer is a
  // project's house, FM Ecosystem is a hanging banner. None of them depends on a status.
  terminal: [
    'oooooooooo',
    'osssssssso',
    'oooooooooo',
    'opoppppppo',
    'oppopppppo',
    'opoppoooPo',
    'oppppppppo',
    'oooooooooo',
  ],
  house: [
    '....oo....',
    '...ohho...',
    '..ohhhho..',
    '.ohhhhhho.',
    'oooooooooo',
    '.oggpllpo.',
    '.oggpllpo.',
    '.oooooooo.',
  ],
  banner: [
    'oooooooo',
    'osssssso',
    'osggggso',
    'osssssso',
    'osssssso',
    'ossoosso',
    'oso..oso',
    'oo....oo',
  ],
  // ES29: the Skills page's Skill Tree view (classification for discovery, never progression).
  tree: [
    '..ooooo..',
    '.osssgso.',
    'osgssssso',
    'ossssgsSo',
    '.oSssSSo.',
    '...olo...',
    '...olo...',
    '..ooooo..',
  ],
} as const satisfies Record<string, Grid>;
export type GlyphName = keyof typeof GLYPHS;

const fill = (ch: string) => {
  const lower = ch.toLowerCase();
  return `var(--px-${lower}${ch === lower ? '' : '2'})`;
};

/** Merge horizontal runs of one colour into single rects: fewer nodes, identical pixels. */
function rects(grid: Grid, key: string) {
  const out = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!;
    for (let x = 0; x < row.length;) {
      const ch = row[x]!;
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      if (ch !== '.')
        out.push(
          <rect key={`${key}${x}-${y}`} x={x} y={y} width={run} height={1} fill={fill(ch)} />,
        );
      x += run;
    }
  }
  return out;
}
const patch = (p: Patch, key: string) =>
  p.map(([x, y, ch]) => (
    <rect key={`${key}${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill(ch)} />
  ));

export const gridSize = (g: Grid) => ({ w: Math.max(...g.map((r) => r.length)), h: g.length });

/** A glyph at an integer scale (default 2×). Fixed width and height, so it never shifts layout. */
export function Glyph({
  name,
  scale = 2,
  className = '',
}: {
  name: GlyphName;
  scale?: number;
  className?: string;
}) {
  const g = GLYPHS[name];
  const { w, h } = gridSize(g);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={`cw-px cw-glyph shrink-0 ${className}`}
    >
      {rects(g, 'g')}
    </svg>
  );
}

/**
 * ES28.3: a glyph in its sunken slot, at 3× (24–33 px). At 2× the 8-pixel glyphs were 16 px on screen and hard to
 * tell apart; inline glyphs (list rows, the header brand) stay 2×. Decorative: the text beside it names the thing.
 */
export function GlyphSlot({ name, className = '' }: { name: GlyphName; className?: string }) {
  return (
    <span className={`cw-slot ${className}`}>
      <Glyph name={name} scale={3} />
    </span>
  );
}

/** The Archivist's animation frames (blink, ledger glow, breathing), drawn inside the Archivist's SVG. */
export function ArchivistFrames({ x = 0, y = 0 }: { x?: number; y?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className="cw-archivist">
      <g className="cw-bob">
        {rects(ARCHIVIST, 'a')}
        <g className="cw-glow">{patch(GLOW, 'l')}</g>
        <g className="cw-blink">{patch(BLINK, 'b')}</g>
      </g>
    </g>
  );
}

/** The Archivist on its own, at an integer scale. */
export function Archivist({
  scale = 3,
  pose = 'idle',
  className = '',
}: {
  scale?: number;
  pose?: Pose;
  className?: string;
}) {
  const { w, h } = gridSize(ARCHIVIST);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={w * scale}
      height={(h + 1) * scale}
      viewBox={`0 -1 ${w} ${h + 1}`}
      shapeRendering="crispEdges"
      className={`cw-px shrink-0 ${className}`}
    >
      {/* Poses are still: they appear next to text people are reading, so only the landing idle frame moves. */}
      {pose === 'idle' ? <ArchivistFrames /> : rects(POSES[pose], 'p')}
    </svg>
  );
}

/* --------------------------------------------------------------------------------------- pixel wordmark */

/** A tiny original bitmap face, only for the letters of "Ecosystem Skills". Rows 0–6 sit on the baseline at row 6. */
const LETTERS: Record<string, Grid> = {
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####', '.....'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.', '.....'],
  c: ['....', '....', '.###', '#...', '#...', '#...', '.###', '....'],
  o: ['....', '....', '.##.', '#..#', '#..#', '#..#', '.##.', '....'],
  s: ['....', '....', '.###', '#...', '.##.', '...#', '###.', '....'],
  y: ['....', '....', '#..#', '#..#', '#..#', '.###', '...#', '###.'],
  t: ['.#.', '.#.', '###', '.#.', '.#.', '.#.', '..#', '...'],
  e: ['....', '....', '.##.', '#..#', '####', '#...', '.###', '....'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '.....'],
  k: ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#', '....'],
  i: ['#', '.', '#', '#', '#', '#', '#', '.'],
  l: ['#.', '#.', '#.', '#.', '#.', '#.', '.#', '..'],
};

export function wordmarkPixels(text: string): { pixels: [number, number][]; width: number } {
  const pixels: [number, number][] = [];
  let x = 0;
  for (const ch of text) {
    if (ch === ' ') {
      x += 3;
      continue;
    }
    const g = LETTERS[ch];
    if (!g) throw new Error(`No wordmark glyph for "${ch}"`);
    g.forEach((row, y) => [...row].forEach((c, dx) => c === '#' && pixels.push([x + dx, y])));
    x += g[0]!.length + 1;
  }
  return { pixels, width: x - 1 };
}

/** "Ecosystem Skills" in the pixel face, with a one-pixel offset shadow. Decorative: the name is also real text. */
export function Wordmark({ scale = 4, className = '' }: { scale?: number; className?: string }) {
  const { pixels, width } = wordmarkPixels('Ecosystem Skills');
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={(width + 1) * scale}
      height={9 * scale}
      viewBox={`0 0 ${width + 1} 9`}
      shapeRendering="crispEdges"
      className={`cw-px block ${className}`}
      style={{ '--wm': width + 1 } as CSSProperties}
    >
      {pixels.map(([x, y]) => (
        <rect
          key={`s${x}-${y}`}
          x={x + 1}
          y={y + 1}
          width={1}
          height={1}
          fill="var(--cw-wordmark-shadow)"
        />
      ))}
      {pixels.map(([x, y]) => (
        <rect key={`p${x}-${y}`} x={x} y={y} width={1} height={1} fill="var(--cw-wordmark)" />
      ))}
    </svg>
  );
}
