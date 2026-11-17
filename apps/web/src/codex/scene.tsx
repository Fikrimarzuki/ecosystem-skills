import type { CSSProperties, ReactElement } from 'react';
import { Painter, Pixels, rng } from '../landing/pixel.tsx';
import { archivistArt, emoteArt } from './companion.tsx';

/*
 * ES29.5: the Archivist's little adventure as a transparent scene that lives directly on the page: a strip of
 * ground, the Archivist, three small monsters and pixel effects. No window background, no scenery.
 *
 * Scale: one scene unit = one art pixel of the canonical 16 × 24 Archivist sprite. The Archivist is drawn from the
 * Living Library's 32 × 48 sprite at half size (so it is exactly the canonical 16 × 24 character), which makes it
 * the same pixel density as the monsters: slime 16 × 11, paper imp 14 × 13 (20 with wings), clockwork beetle 16 × 14.
 *
 * Drawn once as inline SVG (nothing downloaded) and animated entirely by CSS (adventure.css), so nothing re-renders
 * while it plays. Decoration only: no score, XP, coins, levels, rewards or unlocks, and nothing here reads the catalog.
 */

export const SCENE_W = 112;
export const SCENE_H = 46;
export const GROUND = 38;
/** Where the Archivist stands (its top-left), and the left edge of a monster waiting to be attacked. */
const HX = 14;
const HY = GROUND - 24;
const MX = 76;
/** The ground detail repeats every 48 units, so the scrolling in adventure.css (multiples of 48) never jumps. */
const TILE = 48;

type Map = Record<string, string>;
function sprite(p: Painter, x: number, y: number, rows: readonly string[], map: Map) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length;) {
      const ch = row[i]!;
      let n = 1;
      while (row[i + n] === ch) n++;
      if (ch !== '.') p.r(x + i, y + j, n, 1, map[ch] ?? ch);
      i += n;
    }
  });
  return p;
}
const px = (rows: readonly string[], map: Map, x = 0, y = 0) => (
  <Pixels p={sprite(new Painter(), x, y, rows, map)} />
);
const silhouette = (rows: readonly string[]) => rows.map((r) => r.replace(/[^.]/g, 'f'));
const mirror = (rows: readonly string[]) => rows.map((r) => [...r].reverse().join(''));
const at = (x: number, y: number) => `translate(${x} ${y})`;
const vars = (o: Record<string, string>) => o as CSSProperties;

/* ------------------------------------------------------------------------------------- monsters */

const SLIME = [
  '.....oooooo.....',
  '...ooaaaaaaoo...',
  '..oaawwaaaaaao..',
  '.oaawaaaaaaaaao.',
  '.oaaaeaaaaeaaao.',
  'oaaaaeaaaaeaaaao',
  'oaaarraaaarraaao',
  'oaaaaaaaaaaaaaao',
  'obaaaaaaaaaaaabo',
  '.obbbbbbbbbbbbo.',
  '..oooooooooooo..',
];
const SLIME_MAP = { o: 'px:o', a: 'slime', b: 'slime2', w: 'px:p', e: 'px:e', r: 'px:r' };

const IMP = [
  '..o....o......',
  '.oooooooo.....',
  '.oppppppPo....',
  '.opppppppPo...',
  '.oppppppppPo..',
  '.opeppppeppPo.',
  '.opeppppepppo.',
  '.opppppooppppo',
  '.opsspppssppo.',
  '.oPPPPPPPPPPo.',
  '..oooooooooo..',
  '...o......o...',
  '..oo.....oo...',
];
// the imp's paper wings, up and down (left side; the right side is the mirror image)
const WING_UP = ['o..', 'oo.', 'oPo', '.oo'];
const WING_DOWN = ['.oo', 'oPo', 'oo.', 'o..'];
const IMP_MAP = { o: 'px:o', p: 'px:p', P: 'px:p2', e: 'px:e', s: 'px:s' };

const CLOCK = [
  '......oooo......',
  '......oggo......',
  '.......oo.......',
  '....oooooooo....',
  '...ommmmmmmmo...',
  '..ommmooommmmo..',
  '..ommossommmmo..',
  '..ommossommmmo..',
  '..ommmooommmmo..',
  '..onnnnnnnnnno..',
  '...oGgGgGgGgo...',
  '....oooooooo....',
];
const FEET_A = ['....o......o....', '...oo......oo...'];
const FEET_B = ['...o........o...', '..oo........oo..'];
const CLOCK_MAP = { o: 'px:o', m: 'metal', n: 'metal2', g: 'px:g', G: 'px:g2', s: 'px:s' };

/* ----------------------------------------------------------------------------------- attacks, fx */

const ORB = ['.GgG.', 'GgpgG', 'gpppg', 'GgpgG', '.GgG.'];
const SCROLL_A = ['.oooo.', 'oppppo', 'oPPPPo', '.oooo.'];
const SCROLL_B = ['.oo.', 'opPo', 'opPo', 'opPo', 'opPo', '.oo.'];
const STAR = ['..s..', '.sSs.', 'sSpSs', '.sSs.', '..s..'];
const FX = { o: 'px:o', p: 'px:p', P: 'px:p2', g: 'px:g', G: 'px:g2', s: 'px:s', S: 'px:s2' };
const PUFF = ['.cc.', 'cccc', 'cccc', '.cc.'];
const SPARK = ['.g.', 'gpg', '.g.'];
const HIT = ['f...f', '.f.f.', '..f..', '.f.f.', 'f...f'];
const ZED = ['oooo', '..o.', '.o..', 'oooo'];

/* --------------------------------------------------------------------------------------- the ground */

/** Static ground: grass lip, soil, a soft shadow beneath; the ends dissolve into dither so it floats on the page. */
function ground(): Painter {
  const p = new Painter();
  const rows: [number, string][] = [
    [GROUND, 'grass'],
    [GROUND + 1, 'grass2'],
    [GROUND + 2, 'soil'],
    [GROUND + 3, 'soil'],
    [GROUND + 4, 'soil2'],
  ];
  const fade = 14;
  for (const [y, c] of rows) {
    for (let x = 0; x < SCENE_W;) {
      const edge = Math.min(x, SCENE_W - 1 - x);
      if (edge >= fade) {
        // the solid middle, in one rectangle
        p.r(x, y, SCENE_W - 2 * fade, 1, c);
        x = SCENE_W - fade;
        continue;
      }
      const keep = (x * 7 + y * 13) % fade < edge + (y - GROUND) * -1 + 3;
      if (keep) p.r(x, y, 1, 1, c);
      x++;
    }
  }
  p.dither(8, GROUND + 5, SCENE_W - 16, 1, 'shadow', 0.22);
  return p;
}

/** The part that scrolls: grass tufts, flowers and pebbles, drawn for one tile and repeated. */
function groundDetail(): Painter {
  const p = new Painter();
  const rand = rng(29);
  for (let t = 0; t < (SCENE_W + 144) / TILE + 1; t++) {
    const x0 = t * TILE;
    for (let i = 0; i < 7; i++) {
      const x = x0 + Math.floor(rand() * (TILE - 4));
      const k = Math.floor(rand() * 4);
      if (k === 0) p.r(x, GROUND - 2, 1, 2, 'grass2').r(x + 2, GROUND - 1, 1, 1, 'grass2');
      else if (k === 1) p.r(x, GROUND - 1, 3, 1, 'grass2').r(x + 1, GROUND - 2, 1, 1, 'grass');
      else if (k === 2) p.r(x, GROUND - 2, 1, 1, 'flower').r(x, GROUND - 1, 1, 1, 'grass2');
      else p.r(x, GROUND + 2 + Math.floor(rand() * 2), 2, 1, 'soil2');
    }
  }
  return p;
}

/* ---------------------------------------------------------------------------------------- the cast */

interface Mon {
  w: number;
  h: number;
  /** Height above the ground it hovers at. */
  lift: number;
  /** Class of the loop that moves it on the spot (hop, hover, scuttle). */
  loop: string;
  body: ReactElement;
  sil: readonly string[];
  /** Offsets of the silhouette, for monsters with extra parts. */
  extra?: ReactElement;
  shot: ReactElement;
  /** The projectile's travel to this monster, in scene units. */
  to: [number, number];
}

const MONSTERS: Mon[] = [
  {
    w: 16,
    h: 11,
    lift: 0,
    loop: 'adv-hop-loop',
    body: px(SLIME, SLIME_MAP),
    sil: SLIME,
    shot: px(ORB, FX),
    to: [52, 4],
  },
  {
    w: 14,
    h: 13,
    lift: 4,
    loop: 'adv-float-loop',
    body: (
      <>
        {px(IMP, IMP_MAP)}
        <g className="adv-wing-a adv-loop">
          {px(WING_UP, IMP_MAP, -2, 2)}
          {px(mirror(WING_UP), IMP_MAP, 13, 2)}
        </g>
        <g className="adv-wing-b adv-loop">
          {px(WING_DOWN, IMP_MAP, -2, 6)}
          {px(mirror(WING_DOWN), IMP_MAP, 13, 6)}
        </g>
      </>
    ),
    sil: IMP,
    shot: (
      <>
        <g className="adv-spin-a adv-loop">{px(SCROLL_A, FX, 0, 1)}</g>
        <g className="adv-spin-b adv-loop">{px(SCROLL_B, FX, 1, 0)}</g>
      </>
    ),
    to: [50, -1],
  },
  {
    w: 16,
    h: 14,
    lift: 0,
    loop: 'adv-scuttle-loop',
    body: (
      <>
        {px(CLOCK, CLOCK_MAP)}
        <g className="adv-feet-a adv-loop">{px(FEET_A, CLOCK_MAP, 0, 12)}</g>
        <g className="adv-feet-b adv-loop">{px(FEET_B, CLOCK_MAP, 0, 12)}</g>
      </>
    ),
    sil: [...CLOCK, ...FEET_A],
    shot: px(STAR, FX),
    to: [52, 2],
  },
];

/** Hit star, smoke puffs and sparks around a monster's middle. */
function effects(cx: number, cy: number) {
  const puffs = [
    [-9, -5],
    [9, -5],
    [-7, 3],
    [7, 3],
  ] as const;
  const sparks = [
    [-13, -9],
    [13, -8],
    [0, -14],
    [-4, 7],
  ] as const;
  return (
    <>
      <g transform={at(cx - 2.5, cy - 2.5)}>
        <g className="adv-hit adv-t">{px(HIT, { f: 'flash' })}</g>
      </g>
      {puffs.map(([dx, dy], i) => (
        <g key={`p${i}`} transform={at(cx - 2, cy - 2)}>
          <g className="adv-puff adv-t" style={vars({ '--dx': `${dx}px`, '--dy': `${dy}px` })}>
            {px(PUFF, { c: 'smoke' })}
          </g>
        </g>
      ))}
      {sparks.map(([dx, dy], i) => (
        <g key={`s${i}`} transform={at(cx - 1.5, cy - 1.5)}>
          <g className="adv-burst adv-t" style={vars({ '--dx': `${dx}px`, '--dy': `${dy}px` })}>
            {px(SPARK, FX)}
          </g>
        </g>
      ))}
    </>
  );
}

function encounter(m: Mon, n: number) {
  const y = GROUND - m.h - m.lift;
  const cx = MX + m.w / 2;
  const cy = y + m.h / 2;
  const style = vars({ '--sx': `${m.to[0]}px`, '--sy': `${m.to[1]}px` });
  return (
    <g key={n} className={`adv-v${n + 1} adv-t`}>
      <g transform={at(MX, y)}>
        <g className="adv-mon adv-t">
          <Pixels p={new Painter().r(m.w / 2 - 5, m.h + m.lift, 10, 1, 'shadow', 0.3)} />
          <g className={m.loop}>{m.body}</g>
          <g className="adv-flash adv-t">{px(silhouette(m.sil), { f: 'flash' })}</g>
        </g>
      </g>
      {effects(cx, cy)}
      {/* the attack: it gathers at the ledger, then flies; two fainter copies trail behind it */}
      <g transform={at(HX + 10, HY + 10)}>
        {[1, 0.5, 0.25].map((o, i) => (
          <g
            key={i}
            className={`adv-shot adv-t adv-shot-${i}`}
            style={{ ...style, opacity: undefined }}
            data-trail={i || undefined}
          >
            <g opacity={o}>{m.shot}</g>
          </g>
        ))}
      </g>
    </g>
  );
}

function sceneArt(): ReactElement {
  return (
    <>
      <Pixels p={ground()} />
      <g className="adv-detail adv-t">
        <Pixels p={groundDetail()} />
      </g>

      {/* the Archivist: moves (hero), hops (hop) and is drawn at half size */}
      <Pixels p={new Painter().r(HX + 3, GROUND, 11, 1, 'shadow', 0.3)} />
      <g transform={at(HX, HY)}>
        <g className="adv-hero adv-t">
          <g className="adv-hop adv-t">
            <g transform="scale(0.5)">{archivistArt()}</g>
          </g>
        </g>
      </g>

      <g className="adv-world">{MONSTERS.map(encounter)}</g>

      <g transform={at(HX + 4, 3)}>
        <g className="adv-alert adv-t">{emoteArt()}</g>
      </g>
      <g className="adv-sparkle adv-t">{px(SPARK, FX, HX + 15, HY + 1)}</g>

      {/* animation off: the slime naps while the Archivist reads */}
      <g className="adv-zz">
        {px(ZED, { o: 'px:s' }, MX + 15, 24)}
        {px(ZED, { o: 'px:s' }, MX + 20, 18)}
      </g>
    </>
  );
}

let art: ReactElement | undefined;

/** The scene. `cue` only re-keys the reaction "!" so it replays; everything else is the same element every time. */
export function Scene({ cue }: { cue: number }) {
  art ??= sceneArt();
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
      shapeRendering="crispEdges"
      className="cw-px adv-scene"
    >
      {art}
      <g transform={at(HX + 4, 3)}>
        <g key={cue} className="adv-react-emote">
          {emoteArt()}
        </g>
      </g>
    </svg>
  );
}
