import { ARCHIVIST } from '../landing/archivist.ts';
import { brackets, glow, Painter, rng, type Layer } from '../landing/pixel.tsx';
import type { SceneDef, SpotId } from '../landing/stage.tsx';

/*
 * ES28.4 Concept B, "Archive Overworld" (not selected in ES28.5; a development reference): a small top-down map. Four buildings are the catalog destinations (Skill
 * Library, Tool Workshop, Source Archive, Guild Hall); paths meet at a plaza where the Archivist (the canonical
 * 16 × 24 sprite, at the map's own pixel scale) waits, and walks a few steps towards whichever place is chosen.
 * Visitors pick a place directly: there is no movement control, no inventory and nothing to win.
 *
 * Day and night are the same map (prototypes.css): night lights the windows and the lamp posts.
 */

/* ------------------------------------------------------------------------------------------- terrain */

function grass(p: Painter, w: number, h: number, seed: number) {
  const r = rng(seed);
  p.r(0, 0, w, h, 'grass');
  for (let i = 0; i < (w * h) / 26; i++) {
    const x = Math.floor(r() * w),
      y = Math.floor(r() * h);
    const t = r();
    if (t < 0.45) p.r(x, y, 2, 1, 'grass2');
    else if (t < 0.8) p.r(x, y, 1, 2, 'grass3');
    else p.r(x, y, 1, 1, 'grass2');
  }
}

function flowers(p: Painter, x: number, y: number, w: number, h: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 40; i++) {
    const fx = x + Math.floor(r() * w),
      fy = y + Math.floor(r() * h);
    p.r(fx, fy, 1, 1, r() < 0.5 ? 'flower1' : 'flower2').r(fx, fy + 1, 1, 1, 'grass2');
  }
}

/** A path as a chain of rectangles (thick polyline), with a darker edge and a few pebbles. */
function path(p: Painter, pts: readonly (readonly [number, number])[], wid: number, seed: number) {
  const r = rng(seed);
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k]!,
      [x1, y1] = pts[k + 1]!;
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps),
        y = Math.round(y0 + ((y1 - y0) * s) / steps);
      p.r(x - wid / 2 - 1, y - wid / 2 - 1, wid + 2, wid + 2, 'path2');
    }
  }
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k]!,
      [x1, y1] = pts[k + 1]!;
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps),
        y = Math.round(y0 + ((y1 - y0) * s) / steps);
      p.r(x - wid / 2, y - wid / 2, wid, wid, 'path');
      if (r() < 0.06)
        p.r(
          x - wid / 2 + Math.floor(r() * wid),
          y - wid / 2 + Math.floor(r() * wid),
          1,
          1,
          'path2',
        );
    }
  }
}

function river(
  p: Painter,
  sparkA: Painter,
  sparkB: Painter,
  pts: readonly (readonly [number, number])[],
  wid: number,
) {
  const seg = (fn: (x: number, y: number) => void) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k]!,
        [x1, y1] = pts[k + 1]!;
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= steps; s++)
        fn(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps));
    }
  };
  seg((x, y) => p.r(x - wid / 2 - 2, y - wid / 2 - 1, wid + 4, wid + 2, 'shore'));
  seg((x, y) => p.r(x - wid / 2, y - wid / 2, wid, wid, 'water'));
  const r = rng(41);
  let i = 0;
  seg((x, y) => {
    if (i++ % 7) return;
    const dx = Math.floor(r() * (wid - 3)) - wid / 2 + 1;
    (i % 2 ? sparkA : sparkB).r(x + dx, y, 3, 1, 'water2');
    p.r(x + dx + 1, y + 2, 2, 1, 'water3');
  });
}

function bridge(p: Painter, x: number, y: number, w: number, h: number) {
  p.r(x, y, w, h, 'wood')
    .r(x, y, w, 1, 'woodHi')
    .r(x, y + h - 1, w, 1, 'wood3');
  for (let xx = x + 3; xx < x + w; xx += 4) p.r(xx, y + 1, 1, h - 2, 'wood2');
  p.r(x - 1, y - 2, w + 2, 2, 'wood3').r(x - 1, y + h, w + 2, 2, 'wood3');
  for (const xx of [x - 1, x + w - 1]) p.r(xx, y - 4, 2, 4, 'wood2').r(xx, y + h, 2, 4, 'wood2');
}

function tree(p: Painter, x: number, y: number, r0: number, seed: number) {
  const r = rng(seed);
  p.r(x - r0 + 2, y + r0 - 1, 2 * r0 - 2, 3, 'shadow', 0.3);
  p.r(x - 1, y + r0 - 4, 3, 6, 'wood2');
  for (let j = -r0; j <= r0 - 3; j++) {
    const half = Math.round(Math.sqrt(Math.max(0, r0 * r0 - j * j)));
    p.r(x - half, y + j - 3, 2 * half + 1, 1, 'leaf');
    if (j > 0)
      p.r(x + Math.floor(half / 3), y + j - 3, half - Math.floor(half / 3) + 1, 1, 'leaf2');
    if (j < -1) p.r(x - half + 1, y + j - 3, Math.max(1, Math.floor(half / 2)), 1, 'leafHi');
  }
  for (let i = 0; i < r0; i++)
    p.r(
      x - r0 + 2 + Math.floor(r() * (2 * r0 - 3)),
      y - r0 + Math.floor(r() * 2 * r0) - 2,
      1,
      1,
      'leaf2',
    );
}

function pine(p: Painter, x: number, y: number, h: number) {
  p.r(x - 4, y + h - 2, 9, 2, 'shadow', 0.3).r(x, y + h - 4, 2, 4, 'wood2');
  for (let j = 0; j < h - 4; j++) {
    const half = Math.floor(((j % 6) + 2 + j / 3) / 1.5);
    p.r(x - half, y + j, 2 * half + 2, 1, j % 6 < 2 ? 'leafHi' : 'leaf2');
    p.r(x - half, y + j, Math.max(1, half), 1, 'leaf');
  }
}

function lampPost(p: Painter, night: Painter, halo: Painter, x: number, y: number) {
  p.r(x + 2, y + 1, 1, 12, 'iron')
    .r(x + 1, y + 13, 3, 1, 'iron')
    .r(x, y - 2, 5, 3, 'iron');
  p.r(x + 1, y + 1, 3, 2, 'lampGlass');
  night.r(x + 1, y + 1, 3, 2, 'flame');
  glow(halo, x + 2, y + 1, 10, 'halo', 0.12);
}

/* ------------------------------------------------------------------------------------------- buildings */

/** A 3/4 view roof of rows of tiles, with a ridge highlight and eaves shadow. */
function roof(p: Painter, x: number, y: number, w: number, h: number, c: string) {
  for (let j = 0; j < h; j++) {
    const inset = Math.max(0, Math.floor((h - j) / 3) - 1);
    p.r(x + inset - 2, y + j, w - 2 * inset + 4, 1, j % 3 === 2 ? `${c}2` : c);
  }
  p.r(x + Math.floor(h / 3) - 1, y, w - 2 * Math.floor(h / 3) + 2, 1, `${c}Hi`);
  for (let j = 2; j < h; j += 3)
    for (let xx = x + (j % 2 ? 3 : 0); xx < x + w; xx += 6) p.r(xx, y + j, 1, 1, `${c}2`);
  p.r(x - 2, y + h, w + 4, 1, 'shadow', 0.45);
}

function windowPane(p: Painter, day: Painter, night: Painter, x: number, y: number, w = 5, h = 6) {
  p.r(x - 1, y - 1, w + 2, h + 2, 'wood3');
  day.r(x, y, w, h, 'winDay').r(x, y, w, 1, 'winHi');
  night.r(x, y, w, h, 'winLit');
  p.r(x + Math.floor(w / 2), y, 1, h, 'wood3');
}

function door(p: Painter, x: number, y: number, w: number, h: number) {
  p.r(x - 1, y - 1, w + 2, h + 1, 'wood3')
    .r(x, y, w, h, 'door')
    .r(x + Math.floor(w / 2), y, 1, h, 'door2');
  p.r(x + w - 3, y + Math.floor(h / 2), 1, 2, 'brass');
  p.r(x - 2, y + h, w + 4, 2, 'stone2');
}

type Fx = Record<
  'base' | 'day' | 'night' | 'halo' | 'smokeA' | 'smokeB' | 'flagA' | 'flagB',
  Painter
>;

function library(P: Fx, x: number, y: number) {
  const { base: p, day, night } = P;
  roof(p, x, y, 66, 16, 'roofB');
  p.r(x, y + 16, 66, 30, 'stone')
    .r(x, y + 16, 66, 1, 'stoneHi')
    .r(x, y + 45, 66, 1, 'stone3');
  for (let xx = x + 2; xx < x + 64; xx += 8) p.r(xx, y + 18, 1, 26, 'stone2');
  // columns either side of the door, and the open-book sign above it
  for (const cx of [x + 22, x + 41])
    p.r(cx, y + 18, 3, 27, 'column').r(cx, y + 18, 1, 27, 'stoneHi');
  door(p, x + 28, y + 31, 10, 14);
  p.r(x + 26, y + 20, 14, 8, 'paper')
    .r(x + 32, y + 20, 2, 8, 'paper2')
    .box(x + 25, y + 19, 16, 10, 'wood3');
  p.r(x + 27, y + 22, 4, 1, 'paper2')
    .r(x + 35, y + 22, 4, 1, 'paper2')
    .r(x + 27, y + 24, 4, 1, 'paper2');
  for (const wx of [x + 6, x + 14, x + 48, x + 56]) windowPane(p, day, night, wx, y + 26);
  p.r(x + 24, y + 46, 18, 2, 'stone2').r(x + 22, y + 48, 22, 2, 'stone3');
}

function workshopBuilding(P: Fx, x: number, y: number) {
  const { base: p, day, night } = P;
  // chimney behind the roof, with two smoke frames
  p.r(x + 46, y - 6, 7, 12, 'stone2').r(x + 45, y - 7, 9, 2, 'stone3');
  P.smokeA
    .r(x + 47, y - 12, 4, 3, 'smoke')
    .r(x + 49, y - 17, 3, 3, 'smoke', 0.7)
    .r(x + 46, y - 22, 3, 2, 'smoke', 0.5);
  P.smokeB
    .r(x + 48, y - 13, 4, 3, 'smoke')
    .r(x + 46, y - 18, 3, 3, 'smoke', 0.7)
    .r(x + 49, y - 23, 3, 2, 'smoke', 0.5);
  roof(p, x, y, 60, 14, 'roofR');
  p.r(x, y + 14, 60, 26, 'plank').r(x, y + 14, 60, 1, 'woodHi');
  for (let xx = x + 4; xx < x + 60; xx += 5) p.r(xx, y + 15, 1, 25, 'plank2');
  // wide open door with the forge glowing inside
  p.r(x + 22, y + 22, 18, 18, 'wood3').r(x + 23, y + 23, 16, 17, 'forgeIn');
  p.r(x + 27, y + 33, 8, 7, 'forge').r(x + 29, y + 31, 4, 2, 'flame');
  glow(P.halo, x + 31, y + 34, 12, 'halo', 0.1);
  windowPane(p, day, night, x + 7, y + 22);
  windowPane(p, day, night, x + 48, y + 22);
  // anvil, barrel and crates in the yard
  p.r(x + 8, y + 44, 12, 3, 'iron')
    .r(x + 11, y + 47, 6, 2, 'iron')
    .r(x + 9, y + 49, 10, 2, 'iron');
  p.r(x + 46, y + 42, 9, 10, 'crate')
    .box(x + 46, y + 42, 9, 10, 'crate2')
    .r(x + 46, y + 46, 9, 1, 'crate2');
  p.r(x + 56, y + 44, 8, 9, 'crate').box(x + 56, y + 44, 8, 9, 'crate2');
  p.r(x + 34, y + 44, 7, 9, 'wood2')
    .r(x + 34, y + 46, 7, 1, 'iron')
    .r(x + 34, y + 50, 7, 1, 'iron');
  // a fence round the yard
  for (let xx = x - 4; xx < x + 66; xx += 5) p.r(xx, y + 54, 2, 6, 'wood2');
  p.r(x - 4, y + 56, 70, 1, 'wood3');
}

function tower(P: Fx, x: number, y: number) {
  const { base: p, day, night } = P;
  // annex
  roof(p, x + 30, y + 30, 30, 10, 'roofT');
  p.r(x + 30, y + 40, 30, 22, 'stone').r(x + 30, y + 40, 30, 1, 'stoneHi');
  door(p, x + 40, y + 49, 9, 13);
  windowPane(p, day, night, x + 52, y + 46, 4, 5);
  // round tower: vertical bands of shade, a cone roof and slit windows
  const tw = 28;
  for (let i = 0; i < tw; i++) {
    const shade = i < 5 ? 'stoneHi' : i > tw - 7 ? 'stone3' : i > tw - 12 ? 'stone2' : 'stone';
    p.r(x + i, y + 18, 1, 46, shade);
  }
  for (let yy = y + 22; yy < y + 64; yy += 6) p.r(x, yy, tw, 1, 'stone3', 0.5);
  for (let j = 0; j < 20; j++) {
    const half = Math.floor((j * (tw / 2 + 3)) / 20);
    p.r(x + tw / 2 - half, y + j, 2 * half, 1, j % 4 === 3 ? 'roofT2' : 'roofT');
    p.r(x + tw / 2 - half, y + j, Math.max(1, Math.floor(half / 2)), 1, 'roofTHi');
  }
  p.r(x + tw / 2 - 1, y - 5, 2, 6, 'iron').r(x + tw / 2 - 2, y - 6, 4, 2, 'brass');
  windowPane(p, day, night, x + 11, y + 26, 4, 7);
  windowPane(p, day, night, x + 11, y + 42, 4, 7);
  // the scroll emblem
  p.r(x + 6, y + 54, 16, 6, 'paper')
    .r(x + 5, y + 53, 2, 8, 'scroll2')
    .r(x + 21, y + 53, 2, 8, 'scroll2');
  p.r(x + 8, y + 56, 10, 1, 'paper2');
}

function guildHall(P: Fx, x: number, y: number) {
  const { base: p, day, night } = P;
  // flag on the roof (two frames)
  p.r(x + 40, y - 14, 1, 16, 'iron');
  P.flagA
    .r(x + 41, y - 14, 10, 6, 'banner')
    .r(x + 41, y - 14, 10, 1, 'bannerTrim')
    .r(x + 45, y - 12, 3, 2, 'bannerTrim');
  P.flagB
    .r(x + 41, y - 13, 10, 6, 'banner')
    .r(x + 41, y - 13, 10, 1, 'bannerTrim')
    .r(x + 45, y - 11, 3, 2, 'bannerTrim')
    .r(x + 50, y - 14, 1, 1, 'banner');
  roof(p, x, y, 80, 16, 'roofG');
  p.r(x, y + 16, 80, 30, 'plaster').r(x, y + 16, 80, 1, 'paper');
  // timber frame
  for (const xx of [x, x + 20, x + 39, x + 59, x + 79]) p.r(xx, y + 16, 2, 30, 'wood2');
  p.r(x, y + 30, 80, 2, 'wood2').r(x, y + 45, 80, 2, 'wood3');
  for (let k = 0; k < 4; k++) {
    const bx = x + 2 + k * 20;
    for (let j = 0; j < 12; j++) p.r(bx + Math.floor((j * 17) / 12), y + 32 + j, 1, 1, 'wood2');
  }
  door(p, x + 35, y + 30, 12, 16);
  // two banners either side of the door
  for (const bx of [x + 24, x + 51]) {
    p.r(bx, y + 18, 7, 12, 'banner')
      .r(bx, y + 18, 7, 1, 'bannerTrim')
      .r(bx + 2, y + 21, 3, 3, 'bannerTrim');
    p.r(bx, y + 30, 3, 2, 'banner').r(bx + 4, y + 30, 3, 2, 'banner');
  }
  for (const wx of [x + 6, x + 13, x + 64, x + 71]) windowPane(p, day, night, wx, y + 21, 4, 6);
  p.r(x + 32, y + 48, 18, 2, 'stone2');
}

/* ------------------------------------------------------------------------------------------- actor */

const BLINK = [
  [6, 8, 'k'],
  [9, 8, 'k'],
] as const;
const GLOW = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((x) => [x, 13, x % 2 ? 'G' : 'g'] as const);

/** The walker: an outer group places it at home (an SVG attribute), the inner one moves (a CSS transform). */
function walker(x: number, y: number): Layer {
  return {
    at: [x, y],
    kids: [
      {
        cls: 'lp-walker',
        kids: [
          { p: new Painter().r(2, 23, 12, 2, 'shadow', 0.35) },
          {
            cls: 'lp-bob',
            kids: [
              { p: new Painter().grid(0, 0, ARCHIVIST) },
              { cls: 'lp-blink', p: new Painter().patch(0, 0, BLINK) },
              { cls: 'lp-glow', p: new Painter().patch(0, 0, GLOW) },
            ],
          },
        ],
      },
    ],
  };
}

/* ------------------------------------------------------------------------------------------- maps */

const painters = (): Fx & { sparkA: Painter; sparkB: Painter; fore: Painter } => ({
  base: new Painter(),
  day: new Painter(),
  night: new Painter(),
  halo: new Painter(),
  smokeA: new Painter(),
  smokeB: new Painter(),
  flagA: new Painter(),
  flagB: new Painter(),
  sparkA: new Painter(),
  sparkB: new Painter(),
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
    { cls: 'lp-frame-a', p: P.sparkA },
    { cls: 'lp-frame-b', p: P.sparkB },
    { cls: 'lp-frame-a', p: P.flagA },
    { cls: 'lp-frame-b', p: P.flagB },
    { cls: 'lp-frame-a lp-smoke', p: P.smokeA },
    { cls: 'lp-frame-b lp-smoke', p: P.smokeB },
    actor,
    { p: P.fore },
    { cls: 'lp-halo', p: P.halo },
    ...(Object.entries(hl) as [SpotId, Painter][]).map(([id, p]) => ({
      cls: `lp-hl lp-hl-${id}`,
      p,
    })),
  ];
}

function signboard(p: Painter, x: number, y: number, w: number, h: number) {
  // a big wooden notice board on two posts, with a parchment pinned to it (the headline is laid over it)
  p.r(x + 10, y + h - 2, 4, 14, 'wood2').r(x + w - 14, y + h - 2, 4, 14, 'wood2');
  p.r(x + 6, y + h + 10, 14, 3, 'shadow', 0.3).r(x + w - 18, y + h + 10, 14, 3, 'shadow', 0.3);
  p.r(x, y, w, h, 'wood')
    .box(x, y, w, h, 'wood3')
    .r(x + 1, y + 1, w - 2, 1, 'woodHi');
  for (let yy = y + 6; yy < y + h; yy += 6) p.r(x + 1, yy, w - 2, 1, 'wood2');
  p.r(x + 4, y + 4, w - 8, h - 8, 'paper')
    .r(x + 4, y + h - 5, w - 8, 1, 'paper2')
    .r(x + w - 5, y + 4, 1, h - 8, 'paper2');
  for (const [i, j] of [
    [6, 6],
    [w - 8, 6],
    [6, h - 8],
    [w - 8, h - 8],
  ] as const)
    p.r(x + i, y + j, 2, 2, 'brass');
}

/** Desktop map, 384 × 200. */
export function overworldDesktop(): SceneDef {
  const W = 384,
    H = 200;
  const P = painters();
  const b = P.base;
  grass(b, W, H, 2);
  flowers(b, 170, 150, 90, 40, 4);
  flowers(b, 300, 90, 60, 20, 6);
  river(
    b,
    P.sparkA,
    P.sparkB,
    [
      [176, -6],
      [182, 40],
      [172, 90],
      [160, 140],
      [164, 206],
    ],
    12,
  );
  // paths from the plaza to each door, one crossing the bridge to the workshop
  path(
    b,
    [
      [244, 122],
      [229, 84],
    ],
    6,
    1,
  );
  path(
    b,
    [
      [244, 122],
      [300, 116],
      [326, 96],
    ],
    6,
    2,
  );
  path(
    b,
    [
      [244, 122],
      [300, 150],
      [329, 170],
    ],
    6,
    3,
  );
  path(
    b,
    [
      [244, 122],
      [196, 132],
      [140, 150],
      [98, 152],
      [80, 158],
    ],
    6,
    4,
  );
  // plaza with a well
  b.r(222, 110, 44, 26, 'path2').r(224, 112, 40, 22, 'cobble');
  for (let yy = 113; yy < 134; yy += 3)
    for (let xx = 225 + ((yy / 3) % 2) * 2; xx < 263; xx += 4) b.r(xx, yy, 2, 1, 'cobble2');
  b.r(258, 104, 12, 10, 'stone2')
    .r(259, 105, 10, 8, 'stone')
    .r(261, 107, 6, 4, 'water')
    .r(257, 100, 14, 2, 'wood3')
    .r(258, 100, 1, 6, 'wood2')
    .r(269, 100, 1, 6, 'wood2');
  bridge(b, 155, 147, 18, 8);
  signboard(b, 8, 6, 144, 86);
  library(P, 196, 22);
  tower(P, 302, 18);
  workshopBuilding(P, 26, 118);
  guildHall(P, 296, 132);
  for (const [x, y] of [
    [214, 112],
    [274, 128],
    [190, 128],
  ] as const)
    lampPost(b, P.night, P.halo, x, y);
  // trees and pines frame the map
  for (const [x, y, r] of [
    [280, 30, 9],
    [276, 60, 7],
    [130, 104, 8],
    [112, 118, 6],
    [186, 176, 9],
    [270, 182, 8],
    [372, 108, 7],
    [100, 186, 7],
    [10, 112, 7],
    [12, 160, 9],
  ] as const)
    tree(b, x, y, r, x * 3 + y);
  for (const [x, y] of [
    [366, 8],
    [376, 30],
    [374, 160],
    [158, 6],
  ] as const)
    pine(b, x, y, 22);
  const hl = {
    skills: brackets(new Painter(), 190, 4, 78, 76),
    sources: brackets(new Painter(), 296, 4, 70, 84),
    resources: brackets(new Painter(), 18, 98, 88, 86),
    ecosystem: brackets(new Painter(), 290, 112, 92, 80),
  };
  return {
    w: W,
    h: H,
    layers: layersOf(P, walker(236, 104), hl),
    spots: [
      { id: 'skills', box: [190, 4, 78, 76], plate: [204, 74], look: 'left' },
      { id: 'sources', box: [296, 4, 70, 84], plate: [300, 86], look: 'right' },
      { id: 'resources', box: [18, 98, 88, 86], plate: [24, 184], look: 'left' },
      {
        id: 'ecosystem',
        box: [290, 112, 92, 80],
        plate: [380, 184],
        plateEnd: true,
        look: 'right',
      },
    ],
    board: [13, 11, 134, 78],
  };
}

/** Phone map, 168 × 264: the same places stacked around a plaza, with the river crossing the middle. */
export function overworldMobile(): SceneDef {
  const W = 168,
    H = 264;
  const P = painters();
  const b = P.base;
  grass(b, W, H, 9);
  flowers(b, 10, 150, 50, 20, 3);
  flowers(b, 110, 160, 50, 16, 5);
  river(
    b,
    P.sparkA,
    P.sparkB,
    [
      [-6, 130],
      [60, 124],
      [110, 134],
      [176, 128],
    ],
    10,
  );
  path(
    b,
    [
      [84, 168],
      [84, 140],
      [40, 108],
      [40, 76],
    ],
    6,
    1,
  );
  path(
    b,
    [
      [84, 140],
      [126, 108],
      [130, 84],
    ],
    6,
    2,
  );
  path(
    b,
    [
      [84, 168],
      [40, 196],
      [42, 214],
    ],
    6,
    3,
  );
  path(
    b,
    [
      [84, 168],
      [124, 196],
      [126, 214],
    ],
    6,
    4,
  );
  b.r(66, 158, 38, 22, 'path2').r(68, 160, 34, 18, 'cobble');
  for (let yy = 161; yy < 178; yy += 3)
    for (let xx = 69 + ((yy / 3) % 2) * 2; xx < 101; xx += 4) b.r(xx, yy, 2, 1, 'cobble2');
  bridge(b, 76, 124, 16, 10);
  library(P, 8, 22);
  tower(P, 100, 14);
  workshopBuilding(P, 6, 196);
  guildHall(P, 86, 200);
  lampPost(b, P.night, P.halo, 58, 160);
  lampPost(b, P.night, P.halo, 106, 166);
  for (const [x, y, r] of [
    [150, 96, 7],
    [12, 96, 6],
    [158, 176, 7],
    [8, 176, 6],
  ] as const)
    tree(b, x, y, r, x + y * 7);
  pine(b, 86, 2, 20);
  const hl = {
    skills: brackets(new Painter(), 2, 4, 78, 76),
    sources: brackets(new Painter(), 94, 2, 72, 86),
    resources: brackets(new Painter(), 0, 176, 78, 86),
    ecosystem: brackets(new Painter(), 82, 180, 86, 84),
  };
  return {
    w: W,
    h: H,
    layers: layersOf(P, walker(77, 144), hl),
    spots: [
      { id: 'skills', box: [2, 4, 78, 76], plate: [6, 78], look: 'left' },
      { id: 'sources', box: [94, 2, 72, 86], plate: [166, 88], plateEnd: true, look: 'right' },
      { id: 'resources', box: [0, 176, 78, 86], plate: [2, 178], look: 'left' },
      { id: 'ecosystem', box: [82, 180, 86, 84], plate: [166, 182], plateEnd: true, look: 'right' },
    ],
  };
}
