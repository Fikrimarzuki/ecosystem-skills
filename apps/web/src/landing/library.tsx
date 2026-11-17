import {
  ARCHIVIST_LARGE,
  ATTEND,
  BLINK,
  EYES_LEFT,
  EYES_OFF,
  EYES_RIGHT,
  GLOW,
} from './archivist.ts';
import { brackets, glow, Painter, rng, type Layer } from './pixel.tsx';
import type { SceneDef, SpotId } from './stage.tsx';

/*
 * Living Library (ES28.4 Concept A, the landing page since ES28.5): the archive interior as one illustrated room. Four working corners are the
 * catalog destinations (Tool Workshop, Skill Codex, Source Archive, Guild Registry) and the Archivist works at the
 * lectern in the middle, under the window. Two compositions share the same objects: a wide room for desktop and a
 * two-storey cutaway for phones (not a shrunken desktop scene).
 *
 * Morning and evening are the same room: prototypes.css swaps the --lp-* colours, and the day/night layers (sun
 * shafts, stars, lantern light) are shown by theme. Nothing here depends on any review or approval status.
 */

/* ------------------------------------------------------------------------------------------- room shell */

function stoneWall(p: Painter, x: number, y: number, w: number, h: number, seed: number) {
  const r = rng(seed);
  p.r(x, y, w, h, 'wall');
  for (let row = 0, yy = y; yy < y + h; row++, yy += 8) {
    p.r(x, yy, w, 1, 'mortar');
    let xx = x - (row % 2 ? 9 : 0);
    while (xx < x + w) {
      const bw = 16 + Math.floor(r() * 6);
      const tone = r();
      const bx = Math.max(x, xx + 1);
      const bwClip = Math.min(x + w, xx + bw) - bx;
      if (tone < 0.18) p.r(bx, yy + 1, bwClip, 7, 'wall2');
      else if (tone > 0.9) p.r(bx, yy + 1, bwClip, 7, 'wall3');
      // top-left light on each block, and the vertical joint
      p.r(bx, yy + 1, Math.min(bwClip, 4), 1, 'wallHi');
      if (xx + bw < x + w) p.r(xx + bw, yy + 1, 1, 7, 'mortar');
      xx += bw + 1;
    }
  }
}

function ceiling(p: Painter, w: number) {
  p.r(0, 0, w, 7, 'beam');
  for (let x = 3; x < w; x += 22) p.r(x, 1, 1, 5, 'beam2');
  p.r(0, 7, w, 1, 'beam2');
  p.r(0, 8, w, 1, 'shadow', 0.5);
}

function wainscot(p: Painter, x: number, y: number, w: number, h: number) {
  p.r(x, y, w, h, 'wains');
  p.r(x, y, w, 1, 'wainsHi');
  p.r(x, y + 1, w, 1, 'wains2');
  for (let xx = x + 2; xx < x + w - 10; xx += 16) {
    p.box(xx, y + 4, 12, h - 7, 'wains2');
    p.r(xx + 1, y + 5, 10, 1, 'wainsHi');
  }
  p.r(x, y + h - 2, w, 2, 'base');
}

function floor(p: Painter, x: number, y: number, w: number, h: number, seed: number) {
  const r = rng(seed);
  p.r(x, y, w, h, 'floor');
  for (let yy = y; yy < y + h; yy += 6) {
    p.r(x, yy, w, 1, 'floorSeam');
    let xx = x + Math.floor(r() * 30) - 30;
    while (xx < x + w) {
      const pw = 26 + Math.floor(r() * 24);
      if (r() < 0.3)
        p.r(Math.max(x, xx + 1), yy + 1, Math.min(pw - 1, x + w - xx - 1), 5, 'floor2');
      p.r(Math.max(x, xx + 2), yy + 1, Math.min(6, Math.max(0, x + w - xx - 2)), 1, 'floorHi');
      if (xx + pw > x) p.r(xx + pw, yy + 1, 1, 5, 'floorSeam');
      xx += pw + 1;
    }
  }
  p.r(x, y, w, 2, 'shadow', 0.35); // the wall's contact shadow
}

function pillar(p: Painter, x: number, y: number, h: number) {
  p.r(x, y, 6, h, 'wood2');
  p.r(x + 1, y, 1, h, 'woodHi');
  p.r(x + 5, y, 1, h, 'wood3');
  p.r(x - 2, y, 10, 3, 'wood3');
  p.r(x - 1, y + 3, 8, 1, 'wood2');
  p.r(x - 2, y + h - 3, 10, 3, 'wood3');
}

/* ------------------------------------------------------------------------------------------- props */

function books(p: Painter, x: number, base: number, w: number, maxH: number, seed: number) {
  const r = rng(seed);
  for (let xx = x; xx < x + w;) {
    const bw = 2 + Math.floor(r() * 3);
    if (xx + bw > x + w) break;
    if (r() < 0.08) {
      xx += 3; // a gap
      continue;
    }
    const bh = maxH - Math.floor(r() * 4);
    const c = `book${1 + Math.floor(r() * 6)}`;
    p.r(xx, base - bh, bw, bh, c);
    p.r(xx, base - bh, 1, bh, 'bookHi', 0.35);
    p.r(xx, base - bh + 2, bw, 1, 'bookLine');
    if (bh > 6) p.r(xx, base - 3, bw, 1, 'bookLine');
    xx += bw;
  }
  // one book leaning against the end
  p.r(x + w - 2, base - maxH + 3, 2, maxH - 3, 'book2');
}

function bookcase(p: Painter, x: number, y: number, w: number, h: number, seed: number) {
  p.r(x - 2, y - 3, w + 4, 3, 'wood3'); // crown
  p.r(x - 1, y - 4, w + 2, 1, 'woodHi');
  p.r(x, y, w, h, 'wood2');
  p.r(x + 2, y + 2, w - 4, h - 4, 'shelfBack');
  const rowH = 17;
  for (let yy = y + 2, i = 0; yy + rowH <= y + h - 2; yy += rowH, i++) {
    books(p, x + 3, yy + rowH - 2, w - 6, rowH - 5, seed + i * 13);
    p.r(x + 2, yy + rowH - 2, w - 4, 2, 'wood');
    p.r(x + 2, yy + rowH - 2, w - 4, 1, 'woodHi');
  }
  p.r(x, y, 1, h, 'woodHi');
  p.r(x + w - 1, y, 1, h, 'wood3');
  p.r(x - 1, y + h, w + 2, 2, 'wood3');
}

function ladder(p: Painter, x: number, y: number, h: number) {
  // a rolling ladder leaning on the shelf: two rails stepping right as they rise
  for (let j = 0; j < h; j++) {
    const dx = Math.floor((h - j) / 10);
    p.r(x + dx, y + j, 1, 1, 'wood3');
    p.r(x + dx + 9, y + j, 1, 1, 'wood3');
    if (j % 9 === 4) p.r(x + dx + 1, y + j, 8, 1, 'woodHi');
  }
  p.r(x + 1, y + h, 2, 2, 'metal2');
  p.r(x + 8, y + h, 2, 2, 'metal2');
}

/** Half-width of a round arch of radius `a` at row j (0 = top). */
const archHalf = (a: number, j: number) => Math.round(Math.sqrt(Math.max(0, a * a - (a - j) ** 2)));

function windowArch(p: Painter, x: number, y: number, w: number, h: number) {
  const a = Math.floor(w / 2);
  const cx = x + a;
  // stone surround, then the wooden frame, then the glass (sky bands from high to low)
  for (let j = -3; j < h + 1; j++) {
    const half = j < a ? archHalf(a + 3, j + 3) : a + 3;
    p.r(cx - half, y + j, 2 * half, 1, 'wall3');
  }
  for (let j = -1; j < h; j++) {
    const half = j < a ? archHalf(a + 1, j + 1) : a + 1;
    p.r(cx - half, y + j, 2 * half, 1, 'wood3');
  }
  for (let j = 1; j < h - 1; j++) {
    const half = j < a ? archHalf(a - 1, j - 1) : a - 1;
    const band = j < h * 0.35 ? 'sky' : j < h * 0.7 ? 'sky2' : 'skyLow';
    p.r(cx - half, y + j, 2 * half, 1, band);
  }
  // mullions
  p.r(cx - 1, y + 1, 2, h - 2, 'wood3');
  for (let yy = y + a; yy < y + h - 2; yy += 13) p.r(x + 1, yy, w - 2, 1, 'wood3');
  // sill
  p.r(x - 3, y + h, w + 6, 3, 'wood3');
  p.r(x - 4, y + h + 3, w + 8, 2, 'woodHi');
}

function windowView(day: Painter, night: Painter, x: number, y: number, w: number, h: number) {
  // morning: two soft clouds and the far hills; evening: moon and stars
  day.r(x + 4, y + h - 22, 10, 2, 'cloud').r(x + 6, y + h - 24, 6, 2, 'cloud');
  day.r(x + w - 18, y + h - 30, 12, 2, 'cloud').r(x + w - 15, y + h - 32, 6, 2, 'cloud');
  night.r(x + w - 14, y + 12, 6, 6, 'moon').r(x + w - 12, y + 12, 4, 1, 'moonHi');
  night.r(x + w - 15, y + 13, 1, 4, 'moon').r(x + w - 8, y + 13, 1, 4, 'moon');
  const r = rng(7);
  for (let i = 0; i < 12; i++)
    night.r(x + 2 + Math.floor(r() * (w - 4)), y + 6 + Math.floor(r() * (h - 24)), 1, 1, 'star');
  for (const P of [day, night]) {
    P.r(x, y + h - 8, w, 4, 'hill');
    P.r(x + 6, y + h - 10, 14, 2, 'hill').r(x + w - 22, y + h - 11, 16, 3, 'hill');
  }
}

function sunShaft(p: Painter, x: number, y: number, w: number, h: number) {
  // a slanted beam from the window to the floor, drawn as stepped bands
  for (let j = 0; j < h; j++) p.r(x + Math.floor(j * 0.55), y + j, w, 1, 'shaft', 0.22);
}

function lantern(
  p: Pick<Record<string, Painter>, 'base' | 'flameA' | 'flameB' | 'halo'>,
  x: number,
  y: number,
  chain: number,
) {
  const { base, flameA, flameB, halo } = p;
  base.r(x + 3, y - chain, 1, chain, 'metal2');
  base.r(x + 1, y, 5, 2, 'lampDark').r(x, y + 2, 7, 1, 'brass');
  base.r(x + 1, y + 3, 5, 6, 'lampGlass');
  base.r(x, y + 9, 7, 1, 'brass').r(x + 1, y + 10, 5, 1, 'lampDark');
  base.r(x + 1, y + 3, 1, 6, 'brass').r(x + 5, y + 3, 1, 6, 'brass');
  flameA.r(x + 3, y + 4, 1, 4, 'flame').r(x + 2, y + 6, 3, 2, 'flame2');
  flameB.r(x + 3, y + 5, 1, 3, 'flame').r(x + 2, y + 5, 3, 3, 'flame2');
  glow(halo, x + 3, y + 6, 18, 'halo', 0.09);
}

function candle(p: Record<'base' | 'flameA' | 'flameB' | 'halo', Painter>, x: number, y: number) {
  p.base.r(x, y, 2, 5, 'paper').r(x - 1, y + 5, 4, 1, 'brass');
  p.flameA.r(x, y - 2, 2, 2, 'flame').r(x, y - 3, 1, 1, 'flame2');
  p.flameB.r(x, y - 2, 2, 2, 'flame').r(x + 1, y - 3, 1, 1, 'flame2');
  glow(p.halo, x + 1, y - 2, 9, 'halo', 0.1);
}

function plant(p: Painter, x: number, y: number) {
  p.r(x + 1, y + 10, 8, 6, 'pot').r(x, y + 9, 10, 2, 'pot2');
  p.r(x + 4, y + 2, 2, 8, 'plant2');
  p.r(x + 1, y + 3, 4, 3, 'plant')
    .r(x + 5, y, 4, 4, 'plant')
    .r(x + 2, y + 6, 3, 2, 'plant2');
  p.r(x + 6, y + 5, 3, 3, 'plant');
}

function rug(p: Painter, x: number, y: number, w: number, h: number) {
  p.r(x, y, w, h, 'rug');
  p.box(x + 1, y + 1, w - 2, h - 2, 'rug2');
  for (let xx = x + 4; xx < x + w - 4; xx += 6) p.r(xx, y + Math.floor(h / 2), 2, 1, 'rug2');
  p.r(x, y + h, w, 1, 'shadow', 0.3);
  for (let xx = x + 1; xx < x + w; xx += 3) p.r(xx, y + h, 1, 2, 'rugEdge');
}

/* The Archivist: base sprite plus the overlays prototypes.css shows by state (blink, glow, look, attend). */
function archivist(x: number, y: number): Layer {
  return {
    cls: 'lp-actor',
    kids: [
      { cls: 'lp-shadowfoot', p: new Painter().r(x + 4, y + 47, 24, 2, 'shadow', 0.35) },
      {
        cls: 'lp-bob',
        kids: [
          { p: new Painter().grid(x, y, ARCHIVIST_LARGE) },
          { cls: 'lp-look-l', p: new Painter().patch(x, y, EYES_OFF).patch(x, y, EYES_LEFT) },
          { cls: 'lp-look-r', p: new Painter().patch(x, y, EYES_OFF).patch(x, y, EYES_RIGHT) },
          { cls: 'lp-blink', p: new Painter().patch(x, y, BLINK) },
          { cls: 'lp-glow', p: new Painter().patch(x, y, GLOW) },
          { cls: 'lp-attend', p: new Painter().patch(x, y, ATTEND) },
        ],
      },
    ],
  };
}

function lectern(p: Painter, x: number, y: number) {
  p.r(x + 6, y + 8, 4, 26, 'wood2').r(x + 6, y + 8, 1, 26, 'woodHi');
  p.r(x + 2, y + 33, 12, 2, 'wood3');
  p.r(x, y + 4, 16, 4, 'wood3').r(x + 1, y + 3, 14, 1, 'woodHi');
  // the open record book, with ruled lines
  p.r(x + 1, y, 14, 3, 'paper').r(x + 7, y, 1, 3, 'paper2');
  p.r(x + 2, y + 1, 4, 1, 'paper2').r(x + 9, y + 1, 4, 1, 'paper2');
}

function workshop(
  p: Painter,
  fx: Record<'base' | 'led' | 'ledOff', Painter>,
  x: number,
  y: number,
  w: number,
) {
  // pegboard with tools
  const pw = Math.min(84, w - 8);
  p.r(x + 4, y, pw, 26, 'wood').box(x + 4, y, pw, 26, 'wood3');
  for (let j = y + 3; j < y + 24; j += 4)
    for (let i = x + 7; i < x + pw; i += 5) p.r(i, j, 1, 1, 'wood3');
  // hammer, wrench, saw, pliers
  p.r(x + 10, y + 4, 2, 15, 'woodHi')
    .r(x + 7, y + 4, 8, 4, 'metal')
    .r(x + 7, y + 4, 8, 1, 'metalHi');
  p.r(x + 22, y + 5, 2, 15, 'metal')
    .r(x + 20, y + 3, 6, 3, 'metal')
    .r(x + 21, y + 4, 4, 1, 'shelfBack');
  p.r(x + 32, y + 4, 4, 5, 'wood2')
    .r(x + 34, y + 9, 12, 7, 'metal')
    .r(x + 34, y + 15, 12, 1, 'metal2');
  for (let i = x + 34; i < x + 46; i += 2) p.r(i, y + 16, 1, 1, 'metal2');
  p.r(x + 54, y + 4, 2, 10, 'metal2')
    .r(x + 58, y + 4, 2, 10, 'metal2')
    .r(x + 55, y + 13, 4, 3, 'metal');
  p.r(x + 54, y + 16, 2, 6, 'book3').r(x + 58, y + 16, 2, 6, 'book3');
  if (pw > 70)
    p.r(x + 68, y + 6, 10, 10, 'metal')
      .r(x + 70, y + 8, 6, 6, 'shelfBack')
      .r(x + 72, y + 4, 2, 2, 'metal2');
  // bench
  const by = y + 32;
  p.r(x, by, w, 4, 'wood')
    .r(x, by, w, 1, 'woodHi')
    .r(x, by + 4, w, 1, 'wood3');
  p.r(x + 3, by + 5, 3, 26, 'wood2').r(x + w - 6, by + 5, 3, 26, 'wood2');
  p.r(x + 3, by + 20, w - 6, 2, 'wood2');
  // vice and gear
  p.r(x + 8, by - 6, 10, 6, 'metal2')
    .r(x + 9, by - 6, 8, 2, 'metal')
    .r(x + 12, by - 9, 2, 3, 'metal2');
  p.r(x + 26, by - 7, 7, 7, 'brass').r(x + 28, by - 5, 3, 3, 'wood3');
  for (const [i, j] of [
    [29, -9],
    [24, -4],
    [34, -4],
    [29, 1],
  ] as const)
    p.r(x + i, by + j, 2, 2, 'brass');
  // the connector box (an MCP server is a service, so a box with a socket and cables; its lights only blink)
  const mx = x + 42;
  p.r(mx, by - 12, 22, 12, 'metal')
    .box(mx, by - 12, 22, 12, 'metal2')
    .r(mx + 1, by - 11, 20, 1, 'metalHi');
  p.r(mx + 3, by - 8, 6, 5, 'lampDark')
    .r(mx + 4, by - 7, 1, 3, 'metalHi')
    .r(mx + 7, by - 7, 1, 3, 'metalHi');
  fx.ledOff.r(mx + 13, by - 8, 2, 2, 'ledOff').r(mx + 17, by - 8, 2, 2, 'ledOff');
  fx.led.r(mx + 13, by - 8, 2, 2, 'led').r(mx + 17, by - 8, 2, 2, 'led');
  p.r(mx + 22, by - 5, 6, 1, 'cable').r(mx + 27, by - 5, 1, 5, 'cable');
  // toolbox under the bench
  if (w > 80) {
    p.r(x + 12, by + 22, 20, 9, 'book3')
      .r(x + 12, by + 22, 20, 1, 'bookHi')
      .r(x + 20, by + 24, 4, 2, 'brass');
    p.r(x + w - 30, by + 18, 18, 13, 'crate')
      .box(x + w - 30, by + 18, 18, 13, 'crate2')
      .r(x + w - 30, by + 24, 18, 1, 'crate2');
  }
}

function archiveCabinet(p: Painter, x: number, y: number, w: number, h: number) {
  // a card catalogue: many small drawers, each with a brass pull and a paper label
  p.r(x - 1, y - 2, w + 2, 2, 'wood3');
  p.r(x, y, w, h, 'wood2');
  const cols = Math.max(2, Math.floor((w - 2) / 10));
  const dw = Math.floor((w - 2) / cols);
  for (let yy = y + 2; yy + 8 <= y + h - 3; yy += 8)
    for (let i = 0; i < cols; i++) {
      const dx = x + 2 + i * dw;
      p.r(dx, yy, dw - 1, 7, 'wood').r(dx, yy, dw - 1, 1, 'woodHi');
      p.r(dx + 2, yy + 2, dw - 5, 2, 'paper2');
      p.r(dx + Math.floor(dw / 2) - 1, yy + 5, 2, 1, 'brass');
    }
  p.r(x, y + h - 3, w, 3, 'wood3');
}

function scrollRack(p: Painter, x: number, y: number, w: number, h: number, seed: number) {
  const r = rng(seed);
  p.r(x, y, w, h, 'wood3');
  for (let yy = y + 2; yy + 7 <= y + h - 1; yy += 8)
    for (let xx = x + 2; xx + 7 <= x + w - 1; xx += 8) {
      p.r(xx, yy, 7, 7, 'shelfBack');
      // one to three rolled scrolls lying in each cubby, some tied with a band
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const sy = yy + 5 - k * 2;
        p.r(xx, sy, 7, 2, 'scroll')
          .r(xx, sy + 1, 7, 1, 'scroll2')
          .r(xx, sy, 1, 2, 'paper2')
          .r(xx + 6, sy, 1, 2, 'paper2');
        if (r() < 0.35) p.r(xx + 3, sy, 1, 2, 'band');
      }
    }
}

function globe(p: Painter, x: number, y: number) {
  p.r(x + 2, y, 6, 1, 'ocean')
    .r(x + 1, y + 1, 8, 6, 'ocean')
    .r(x + 2, y + 7, 6, 1, 'ocean');
  p.r(x + 2, y + 2, 3, 2, 'plant')
    .r(x + 6, y + 4, 2, 2, 'plant')
    .r(x + 3, y + 5, 2, 1, 'plant');
  p.r(x, y + 3, 1, 3, 'brass').r(x + 9, y + 3, 1, 3, 'brass');
  p.r(x + 4, y + 8, 2, 2, 'brass').r(x + 2, y + 10, 6, 1, 'wood3');
}

function guildDoor(p: Painter, x: number, y: number, w: number, h: number) {
  const arch = Math.floor(w / 2);
  p.r(x - 3, y + arch - 2, w + 6, h - arch + 2, 'stone');
  for (let j = 0; j < arch; j++) {
    const inset = Math.max(0, arch - Math.round(Math.sqrt(arch * arch - (arch - j) ** 2)));
    p.r(x - 3 + inset, y - 3 + j, w + 6 - 2 * inset, 1, 'stone');
    p.r(x + inset, y + j, w - 2 * inset, 1, 'door');
  }
  p.r(x, y + arch, w, h - arch, 'door');
  for (let j = 2; j < h; j++) {
    const half = j < arch ? archHalf(arch, j) : arch;
    for (let xx = x + 4; xx < x + w - 2; xx += 5)
      if (Math.abs(xx - (x + arch)) < half - 1) p.r(xx, y + j, 1, 1, 'door2');
  }
  p.r(x + 1, y + arch + 4, w - 2, 2, 'iron').r(x, y + h - 12, w, 2, 'iron');
  p.r(x + arch - 1, y + 2, 2, h - 2, 'door2');
  const ry = y + Math.floor(h / 2);
  for (const rx of [x + arch - 6, x + arch + 3])
    p.r(rx, ry, 3, 1, 'brass')
      .r(rx, ry + 3, 3, 1, 'brass')
      .r(rx - 1, ry + 1, 1, 2, 'brass')
      .r(rx + 3, ry + 1, 1, 2, 'brass');
  p.r(x - 4, y + h, w + 8, 2, 'stone2');
}

function banner(
  p: Record<'base' | 'bannerA' | 'bannerB', Painter>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  p.base
    .r(x - 2, y, w + 4, 2, 'wood3')
    .r(x - 3, y - 1, 2, 4, 'brass')
    .r(x + w + 1, y - 1, 2, 4, 'brass');
  for (const [P, sway] of [
    [p.bannerA, 0],
    [p.bannerB, 1],
  ] as const) {
    P.r(x, y + 2, w, h - 6, 'banner')
      .r(x, y + 2, 1, h - 6, 'banner2')
      .r(x + w - 1, y + 2, 1, h - 6, 'banner2');
    P.r(x + 1, y + 3, w - 2, 1, 'bannerTrim').r(x + 1, y + h - 6, w - 2, 1, 'bannerTrim');
    // swallowtail, shifted by one pixel on the second frame
    const half = Math.floor(w / 2);
    for (let j = 0; j < 5; j++) {
      P.r(x + sway, y + h - 4 + j - 0, half - j, 1, 'banner');
      P.r(x + half + j + sway, y + h - 4 + j, half - j, 1, 'banner');
    }
    // the crest: an open book (the guild keeps its own records), pages with ruled lines and a gold spine
    const cx = x + Math.floor(w / 2) - 7;
    const cy = y + 12;
    P.r(cx + 1, cy, 6, 1, 'crest').r(cx + 7, cy, 6, 1, 'crest');
    P.r(cx, cy + 1, 7, 8, 'crest').r(cx + 7, cy + 1, 7, 8, 'crest');
    P.r(cx + 6, cy, 2, 10, 'bannerTrim').r(cx, cy + 9, 14, 1, 'bannerTrim');
    for (const ly of [3, 5, 7])
      P.r(cx + 1, cy + ly, 4, 1, 'paper2').r(cx + 9, cy + ly, 4, 1, 'paper2');
  }
}

/**
 * ES28.5 sign hardware (the idea borrowed from Concept B's signposts): two short chains from a beam, or from an iron
 * wall bracket, to where a destination's sign hangs. The sign itself is the HTML link (stage.tsx), so its words stay
 * real text in both languages; the art only hangs it in the room.
 */
function hanger(
  p: Painter,
  xs: readonly number[],
  top: number,
  bottom: number,
  arm?: readonly [number, number],
) {
  if (arm) {
    p.r(arm[0], top - 2, arm[1] - arm[0], 2, 'iron').r(
      arm[0],
      top - 2,
      arm[1] - arm[0],
      1,
      'metal',
    );
    p.r(arm[1] - 2, top - 5, 3, 7, 'iron').r(arm[1] - 1, top - 4, 1, 1, 'brass');
  }
  for (const x of xs) {
    for (let y = top; y < bottom; y++) p.r(x, y, 1, 1, (y - top) % 2 ? 'metal' : 'iron');
    p.r(x - 1, bottom - 1, 3, 1, 'brass');
  }
}

/* ------------------------------------------------------------------------------------------- scenes */

const painters = () => ({
  base: new Painter(),
  day: new Painter(),
  night: new Painter(),
  halo: new Painter(),
  flameA: new Painter(),
  flameB: new Painter(),
  led: new Painter(),
  ledOff: new Painter(),
  bannerA: new Painter(),
  bannerB: new Painter(),
  motes: new Painter(),
  fore: new Painter(),
});

function layersOf(
  P: ReturnType<typeof painters>,
  actor: Layer,
  hl: Record<SpotId, Painter>,
): Layer[] {
  return [
    { p: P.base },
    { cls: 'lp-day', p: P.day },
    { cls: 'lp-night', p: P.night },
    { cls: 'lp-ledoff', p: P.ledOff },
    { cls: 'lp-led', p: P.led },
    { cls: 'lp-frame-a', p: P.bannerA },
    { cls: 'lp-frame-b', p: P.bannerB },
    actor,
    { p: P.fore },
    { cls: 'lp-halo', p: P.halo },
    { cls: 'lp-flicker-a', p: P.flameA },
    { cls: 'lp-flicker-b', p: P.flameB },
    { cls: 'lp-motes', p: P.motes },
    ...(Object.entries(hl) as [SpotId, Painter][]).map(([id, p]) => ({
      cls: `lp-hl lp-hl-${id}`,
      p,
    })),
  ];
}

function motes(p: Painter, x: number, y: number, w: number, h: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < 9; i++)
    p.r(x + Math.floor(r() * w), y + Math.floor(r() * h), 1, 1, 'mote', 0.8);
}

/** Desktop: one wide room, 384 × 200 (3× at 1152 px). */
export function libraryDesktop(): SceneDef {
  const W = 384,
    H = 196,
    FLOOR = 160;
  const P = painters();
  const b = P.base;
  stoneWall(b, 0, 8, W, FLOOR - 8, 11);
  ceiling(b, W);
  wainscot(b, 0, 128, W, 24);
  floor(b, 0, FLOOR, W, H - FLOOR, 5);
  // the title scroll hangs on the left wall (the headline is real text laid over it)
  b.r(28, 0, 1, 10, 'metal2').r(124, 0, 1, 10, 'metal2');
  b.r(8, 10, 140, 4, 'wood3').r(6, 10, 3, 4, 'brass').r(147, 10, 3, 4, 'brass');
  b.r(10, 14, 136, 76, 'paper')
    .r(10, 14, 136, 1, 'paper2')
    .r(10, 14, 1, 76, 'paper2')
    .r(145, 14, 1, 76, 'paper2');
  b.dither(11, 86, 134, 4, 'paper2');
  b.r(8, 90, 140, 4, 'wood3').r(6, 90, 3, 4, 'brass').r(147, 90, 3, 4, 'brass');
  b.r(11, 94, 134, 1, 'shadow', 0.3);
  // pillars between the corners
  pillar(b, 149, 8, FLOOR - 8);
  pillar(b, 282, 8, FLOOR - 8);
  // Tool Workshop (under the scroll)
  workshop(b, P, 8, 98, 138);
  // Skill Codex
  bookcase(b, 158, 18, 56, FLOOR - 20, 3);
  ladder(b, 200, 74, FLOOR - 76);
  // window, lantern, lectern and the Archivist
  windowArch(b, 226, 20, 50, 74);
  windowView(P.day, P.night, 226, 20, 50, 74);
  sunShaft(P.day, 228, 96, 22, 56);
  motes(P.motes, 232, 100, 30, 48, 3);
  lantern(P, 216, 30, 22);
  rug(b, 222, FLOOR + 6, 60, 10);
  lectern(b, 262, FLOOR - 34);
  candle(P, 266, FLOOR - 39);
  plant(b, 282, FLOOR - 16);
  // Source Archive
  scrollRack(b, 292, 30, 46, 50, 9);
  globe(b, 316, 92);
  archiveCabinet(b, 292, 106, 46, FLOOR - 106);
  // Guild Registry
  banner(P, 352, 12, 24, 40);
  guildDoor(b, 348, 76, 32, FLOOR - 76);
  // the four signs: chains from the beam (Codex, Archive), iron brackets from the pillars (Workshop, Guild)
  hanger(P.fore, [166, 205], 8, 17);
  hanger(P.fore, [298, 331], 8, 15);
  hanger(P.fore, [109, 139], 99, 102, [104, 149]);
  hanger(P.fore, [350, 376], 57, 59, [344, 384]);
  // floor props in front
  P.fore
    .r(170, FLOOR + 26, 14, 3, 'book1')
    .r(171, FLOOR + 23, 12, 3, 'book4')
    .r(172, FLOOR + 20, 10, 3, 'book2');
  P.fore.r(170, FLOOR + 29, 14, 1, 'shadow', 0.4);
  const hl = {
    resources: brackets(new Painter(), 4, 94, 145, 70),
    skills: brackets(new Painter(), 154, 10, 64, 154),
    sources: brackets(new Painter(), 288, 10, 54, 154),
    ecosystem: brackets(new Painter(), 342, 10, 42, 154),
  };
  return {
    w: W,
    h: H,
    layers: layersOf(P, archivist(232, FLOOR - 47), hl),
    spots: [
      { id: 'resources', box: [4, 94, 145, 70], plate: [104, 102], plateMin: 40, look: 'left' },
      { id: 'skills', box: [154, 10, 64, 154], plate: [161, 17], plateMin: 50, look: 'left' },
      { id: 'sources', box: [288, 10, 54, 154], plate: [293, 15], plateMin: 44, look: 'right' },
      {
        id: 'ecosystem',
        box: [342, 10, 42, 154],
        plate: [382, 59],
        plateEnd: true,
        plateMin: 38,
        look: 'right',
      },
    ],
    board: [13, 15, 130, 74],
  };
}

/** Phones: a two-storey cutaway, 168 × 230, with the Archivist large in the middle of the ground floor. */
export function libraryMobile(): SceneDef {
  const W = 168,
    H = 230,
    UP = 112,
    FLOOR = 214;
  const P = painters();
  const b = P.base;
  stoneWall(b, 0, 8, W, H, 23);
  ceiling(b, W);
  // mezzanine: wall, balcony floor with a railing, the ground floor below
  b.r(0, UP, W, 6, 'wood2')
    .r(0, UP, W, 1, 'woodHi')
    .r(0, UP + 6, W, 2, 'wood3')
    .r(0, UP + 8, W, 1, 'shadow', 0.4);
  for (let x = 64; x < 104; x += 5) b.r(x, UP - 12, 2, 12, 'wood2');
  b.r(62, UP - 14, 44, 2, 'wood3');
  wainscot(b, 0, FLOOR - 22, W, 22);
  floor(b, 0, FLOOR, W, H - FLOOR, 8);
  // upstairs: Skill Codex (left), window (centre), Source Archive (right)
  bookcase(b, 6, 18, 54, UP - 20, 4);
  windowArch(b, 70, 18, 28, 56);
  windowView(P.day, P.night, 70, 18, 28, 56);
  scrollRack(b, 106, 30, 54, 26, 12);
  archiveCabinet(b, 106, 64, 54, UP - 64);
  // downstairs: Tool Workshop (left), the Archivist (centre), Guild Registry (right)
  workshop(b, P, 4, FLOOR - 64, 58);
  lantern(P, 80, 128, 8);
  sunShaft(P.day, 72, 76, 16, 36);
  rug(b, 62, FLOOR + 4, 46, 9);
  banner(P, 128, 144, 20, 28);
  guildDoor(b, 124, 176, 28, FLOOR - 176);
  // signs: chains from the ceiling upstairs, from the balcony's underside downstairs
  hanger(P.fore, [13, 48], 7, 13);
  hanger(P.fore, [113, 150], 7, 13);
  hanger(P.fore, [11, 44], UP + 9, 125);
  hanger(P.fore, [124, 158], UP + 9, 125);
  motes(P.motes, 76, 80, 20, 30, 5);
  const hl = {
    skills: brackets(new Painter(), 3, 8, 60, 104),
    sources: brackets(new Painter(), 103, 8, 62, 104),
    resources: brackets(new Painter(), 1, 121, 64, 95),
    ecosystem: brackets(new Painter(), 104, 121, 62, 95),
  };
  return {
    w: W,
    h: H,
    layers: layersOf(P, archivist(68, FLOOR - 47), hl),
    spots: [
      { id: 'skills', box: [3, 8, 60, 104], plate: [8, 13], plateMin: 46, look: 'left' },
      {
        id: 'sources',
        box: [103, 8, 62, 104],
        plate: [164, 13],
        plateEnd: true,
        plateMin: 48,
        look: 'right',
      },
      { id: 'resources', box: [1, 121, 64, 95], plate: [6, 125], plateMin: 44, look: 'left' },
      {
        id: 'ecosystem',
        box: [104, 121, 62, 95],
        plate: [164, 125],
        plateEnd: true,
        plateMin: 46,
        look: 'right',
      },
    ],
  };
}
