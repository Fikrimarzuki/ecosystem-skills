import type { ReactNode } from 'react';

/*
 * ES28.4 prototype pixel painter. Scenes are drawn in code at native resolution (one unit = one art pixel) and
 * rendered as inline SVG with crisp edges, so there is nothing to download, nothing to cache separately and nothing
 * remote. Colours are token names drawn with `var(--lp-<name>)` (prototypes.css defines a morning and an evening set),
 * or palette letters from the canonical sprites drawn with the production `--px-<letter>` tokens.
 *
 * Everything here is decorative world art: the SVG that holds it is aria-hidden and never focusable.
 */

export type Rect = readonly [
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
  opacity?: number,
];

/** Deterministic random numbers, so a scene is identical on every render, server and client. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class Painter {
  readonly out: Rect[] = [];
  r(x: number, y: number, w: number, h: number, c: string, o?: number) {
    if (w > 0 && h > 0) this.out.push(o === undefined ? [x, y, w, h, c] : [x, y, w, h, c, o]);
    return this;
  }
  /** A one-pixel outline box. */
  box(x: number, y: number, w: number, h: number, c: string) {
    return this.r(x, y, w, 1, c)
      .r(x, y + h - 1, w, 1, c)
      .r(x, y, 1, h, c)
      .r(x + w - 1, y, 1, h, c);
  }
  /** Checkerboard dither inside a box (every other pixel), for soft light and texture. */
  dither(x: number, y: number, w: number, h: number, c: string, o?: number, phase = 0) {
    for (let j = 0; j < h; j++)
      for (let i = (j + phase) % 2; i < w; i += 2) this.r(x + i, y + j, 1, 1, c, o);
    return this;
  }
  /** A palette-letter grid (see art.tsx): lowercase = --px-<l>, uppercase = --px-<l>2, '.' transparent. */
  grid(x: number, y: number, g: readonly string[], flip = false) {
    for (let j = 0; j < g.length; j++) {
      const row = flip ? [...g[j]!].reverse().join('') : g[j]!;
      for (let i = 0; i < row.length;) {
        const ch = row[i]!;
        let n = 1;
        while (i + n < row.length && row[i + n] === ch) n++;
        if (ch !== '.') this.r(x + i, y + j, n, 1, letter(ch));
        i += n;
      }
    }
    return this;
  }
  /** Single pixels in palette letters, relative to (x, y): animation frames drawn over a grid. */
  patch(x: number, y: number, pts: readonly (readonly [number, number, string])[]) {
    for (const [i, j, ch] of pts) this.r(x + i, y + j, 1, 1, letter(ch));
    return this;
  }
}

/** A drawable layer: a painter, or a group of layers, with the class that styles or animates it. */
export interface Layer {
  cls?: string;
  p?: Painter;
  kids?: Layer[];
  /** Static transform for the group (an actor's position). */
  at?: readonly [number, number];
}

export function Layers({ layers }: { layers: Layer[] }) {
  return (
    <>
      {layers.map((l, i) => (
        <g
          key={i}
          className={l.cls}
          transform={l.at ? `translate(${l.at[0]} ${l.at[1]})` : undefined}
        >
          {l.p && <Pixels p={l.p} />}
          {l.kids && <Layers layers={l.kids} />}
        </g>
      ))}
    </>
  );
}

/** Palette letters use the production sprite tokens, so the Archivist keeps its exact colours in both themes. */
const letter = (ch: string) => {
  const l = ch.toLowerCase();
  return `px:${l}${ch === l ? '' : '2'}`;
};

const fill = (c: string) => (c.startsWith('px:') ? `var(--px-${c.slice(3)})` : `var(--lp-${c})`);

/**
 * Draws a painter's rectangles as few <path> elements as possible without changing a single pixel: a rectangle joins
 * the latest path of its colour when nothing painted after that path overlaps it, so the painting order is exactly
 * preserved. A detailed scene becomes a few hundred DOM nodes instead of thousands of <rect>s.
 */
export function Pixels({ p, className }: { p: Painter; className?: string }) {
  type Run = {
    key: string;
    c: string;
    o?: number;
    d: string[];
    r: Rect[];
    box: [number, number, number, number];
  };
  const runs: Run[] = [];
  const hit = (a: Rect, b: readonly [number, number, number, number] | Rect) =>
    a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  for (const rect of p.out) {
    const [x, y, w, h, c, o] = rect;
    const key = `${c}|${o ?? ''}`;
    let target: Run | undefined;
    for (let i = runs.length - 1; i >= 0; i--) {
      const run = runs[i]!;
      if (run.key === key) {
        target = run;
        break;
      }
      // something of another colour, painted later, covers this spot: the order matters here
      if (hit(rect, run.box) && run.r.some((q) => hit(rect, q))) break;
    }
    if (!target) runs.push((target = { key, c, o, d: [], r: [], box: [x, y, w, h] }));
    target.d.push(`M${x} ${y}h${w}v${h}h${-w}z`);
    target.r.push(rect);
    const [bx, by, bw, bh] = target.box;
    const nx = Math.min(bx, x),
      ny = Math.min(by, y);
    target.box = [nx, ny, Math.max(bx + bw, x + w) - nx, Math.max(by + bh, y + h) - ny];
  }
  return (
    <g className={className}>
      {runs.map((r, i) => (
        <path key={i} d={r.d.join('')} fill={fill(r.c)} opacity={r.o} />
      ))}
    </g>
  );
}

/** A whole scene: fixed viewBox, crisp pixels, hidden from assistive technology. */
export function Art({
  w,
  h,
  children,
  className = '',
}: {
  w: number;
  h: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMid meet"
      className={`lp-art cw-px ${className}`}
    >
      {children}
    </svg>
  );
}

/** Soft light as stepped discs (a few translucent circles), so lamps glow round instead of square. */
export function glow(p: Painter, cx: number, cy: number, r: number, c = 'halo', o = 0.1) {
  for (const [k, op] of [
    [1, o],
    [0.68, o * 1.3],
    [0.4, o * 1.6],
  ] as const) {
    const rr = Math.round(r * k);
    for (let j = -rr; j <= rr; j++) {
      const half = Math.round(Math.sqrt(rr * rr - j * j));
      p.r(cx - half, cy + j, 2 * half + 1, 1, c, op);
    }
  }
  return p;
}

/** RPG selection brackets around a destination, shown on hover and keyboard focus (prototypes.css). */
export function brackets(p: Painter, x: number, y: number, w: number, h: number, c = 'select') {
  const l = 5;
  return p
    .r(x, y, l, 1, c)
    .r(x, y, 1, l, c)
    .r(x + w - l, y, l, 1, c)
    .r(x + w - 1, y, 1, l, c)
    .r(x, y + h - 1, l, 1, c)
    .r(x, y + h - l, 1, l, c)
    .r(x + w - l, y + h - 1, l, 1, c)
    .r(x + w - 1, y + h - l, 1, l, c);
}
