import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadRegistry, type Catalog } from '@ecosystem-skills/catalog';
import { Page } from './App.tsx';
import { ARCHIVIST, GLYPHS, gridSize, wordmarkPixels } from './art.tsx';
import { effectiveMotion, MotionToggle, readMotionPref } from './motion.tsx';
import { filterSkills, groupOf, groupsInUse, stage } from './lib.ts';
import { SkillCard } from './pages/Skills.tsx';

/* ES28 Command Window: the rules in docs/command-window-design.md that can be checked mechanically. */
const repo = resolve(__dirname, '../../..');
const catalog: Catalog = loadRegistry(repo).catalog;
// ES28.5: the landing page's stylesheet follows the same rules (motion keyed to the setting, nothing remote).
const css =
  readFileSync(join(__dirname, 'index.css'), 'utf8') +
  '\n' +
  readFileSync(join(__dirname, 'landing/landing.css'), 'utf8');
const text = (s: string) =>
  s
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const page = (route: Parameters<typeof Page>[0]['route']) =>
  renderToString(<Page route={route} catalog={catalog} />);

/** Declarations of one CSS block (`:root {` or `html.dark {`), as a set of custom property names. */
function tokens(selector: string): Set<string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('\n}', start));
  return new Set([...body.matchAll(/(--[\w-]+):/g)].map((m) => m[1]!));
}

describe('ES28 art: original, palette-indexed, themed by tokens', () => {
  const grids = { archivist: ARCHIVIST, ...GLYPHS };
  it('every grid is rectangular and uses only palette letters', () => {
    for (const [name, g] of Object.entries(grids)) {
      const { w } = gridSize(g);
      for (const row of g) {
        expect(row.length, `${name}: "${row}"`).toBe(w);
        expect(row, name).toMatch(/^[.ohkerlpgsHKLPGS]+$/);
      }
    }
    expect(gridSize(ARCHIVIST)).toEqual({ w: 16, h: 24 });
  });
  it('every palette letter has a light and a dark token, so the themes swap colours, not art', () => {
    const used = new Set(
      Object.values(grids).flatMap((g) => [...g.join('')].filter((c) => c !== '.')),
    );
    const light = tokens(':root');
    const dark = tokens('html.dark');
    for (const c of used) {
      const v = `--px-${c.toLowerCase()}${c === c.toLowerCase() ? '' : '2'}`;
      expect(light.has(v), v).toBe(true);
      expect(dark.has(v), v).toBe(true);
    }
    // The scene and frame tokens exist in both themes too.
    for (const v of [...light].filter((x) => /^--(sc|cw)-/.test(x)))
      expect(dark.has(v), v).toBe(true);
  });
  it('the wordmark face covers its text', () => {
    expect(wordmarkPixels('Ecosystem Skills').width).toBeGreaterThan(60);
    expect(() => wordmarkPixels('X')).toThrow();
  });
  it('all decorative art is hidden from assistive technology and never focusable', () => {
    for (const route of [{ page: 'home' }, { page: 'skills', query: { q: 'zzz-none' } }] as const) {
      const html = page(route);
      const svgs = [...html.matchAll(/<svg[^>]*class="[^"]*cw-px[^"]*"[^>]*>/g)].map((m) => m[0]);
      expect(svgs.length, route.page).toBeGreaterThan(0);
      for (const s of svgs) {
        expect(s).toContain('aria-hidden="true"');
        expect(s).toContain('focusable="false"');
      }
    }
  });
  it('ships no remote art or fonts: every url() in the stylesheet is local or a data URI', () => {
    for (const m of css.matchAll(/url\(([^)]*)\)/g))
      expect(m[1], m[1]).toMatch(/^("data:|'data:|'\.\/assets\/fonts\/)/);
    const art = readFileSync(join(__dirname, 'art.tsx'), 'utf8');
    expect(art).not.toMatch(/https?:\/\//);
  });
});

describe('ES28 security honesty: status is never a game mechanic', () => {
  it('every skill card uses the same frame whatever its review status or source', () => {
    const byStage = new Map<string, string>();
    for (const s of catalog.skills) {
      const key = stage(s);
      if (byStage.has(key)) continue;
      const html = renderToString(
        <ul>
          <SkillCard catalog={catalog} skill={s} />
        </ul>,
      );
      byStage.set(key, /<li[^>]*>\s*<div class="([^"]+)"/.exec(html)![1]!);
    }
    expect(byStage.size).toBeGreaterThanOrEqual(3);
    expect(new Set(byStage.values()).size).toBe(1);
  });
  it('no rarity, level, XP, achievement or unlock vocabulary on the converted pages', () => {
    for (const route of [{ page: 'home' }, { page: 'skills' }] as const) {
      const t = text(page(route)).replace(
        'It is not a progression: nothing here is locked or unlocked.',
        '',
      );
      expect(t, route.page).not.toMatch(
        /\b(rarity|rare|epic|legendary|mythic|xp|experience points|level \d|level up|achievement|unlock(ed)?|loot|power)\b/i,
      );
    }
    const html = page({ page: 'home' });
    expect(html).not.toMatch(/role="progressbar"|<progress|<meter/);
  });
});

describe('ES28 landing page', () => {
  const html = page({ page: 'home' });
  it('leads to Skills, Resources, Sources and FM Ecosystem with real counts (ES28.5: signs in the room)', () => {
    for (const [path, n, word] of [
      ['/skills', catalog.skills.length, 'skills'],
      ['/resources', catalog.resources.length, 'resources'],
      ['/sources', catalog.sources.length, 'sources'],
    ] as const) {
      const sign = new RegExp(`<a href="${path}" class="lp-spot"[^>]*>.*?</a>`, 's').exec(
        html,
      )?.[0];
      expect(sign, path).toBeDefined();
      expect(text(sign!), path).toContain(`${n} ${word}`);
    }
  });
  it('the skill tree is a category map: every node links to the filtered catalog with its real count', () => {
    const tree = html.slice(html.indexOf('class="cw-tree'), html.indexOf('id="about-h"'));
    for (const g of groupsInUse(catalog)) {
      const n = filterSkills(catalog, { group: g }).length;
      expect(n).toBe(catalog.skills.filter((s) => groupOf(s) === g).length);
      expect(tree, g).toContain(
        `href="/skills?group=${encodeURIComponent(g).replace(/%20/g, '+')}"`,
      );
      expect(text(tree), g).toContain(`${g} ${n} ${n === 1 ? 'skill' : 'skills'}`);
    }
  });
  it('states the live numbers in text next to the decorative scene', () => {
    expect(text(html)).toContain(
      `${catalog.skills.length} skills · ${catalog.resources.length} resources · ${catalog.sources.length} sources, all read-only.`,
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
  });
});

describe('ES28 Animation setting', () => {
  it('runs only when the setting is on and the device does not ask for reduced motion', () => {
    expect(effectiveMotion('on', false)).toBe('on');
    expect(effectiveMotion('off', false)).toBe('off');
    expect(effectiveMotion('on', true)).toBe('off');
    expect(effectiveMotion('off', true)).toBe('off');
    expect(readMotionPref({ getItem: () => 'off' })).toBe('off');
    expect(readMotionPref({ getItem: () => null })).toBe('on');
    expect(
      readMotionPref({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('on');
  });
  it('is a labelled toggle button', () => {
    const html = renderToString(<MotionToggle />);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-pressed="(true|false)"/);
    expect(html).toContain('aria-label="Turn animation off"');
    expect(text(html)).toContain('Animation: on');
  });
  it('every decorative animation is keyed to html[data-motion="on"], set before first paint', () => {
    const outsideReduce = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/, '');
    const rules = [...outsideReduce.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const animated = rules.filter(([, , body]) => /(^|[\s;])animation:/.test(body!));
    expect(animated.length).toBeGreaterThanOrEqual(4);
    for (const [, sel] of animated)
      for (const s of sel!.split(',')) expect(s.trim(), s).toMatch(/^html\[data-motion='on'\]/);
    const index = readFileSync(join(__dirname, '../index.html'), 'utf8');
    expect(index).toContain("localStorage.getItem('motion')");
    expect(index).toContain('prefers-reduced-motion: reduce');
  });
});

describe('ES28 fonts', () => {
  const dir = join(__dirname, 'assets/fonts');
  it('are self-hosted, licensed, within budget and never swap late', () => {
    const files = readdirSync(dir);
    expect(files).toContain('OFL-AtkinsonHyperlegible.txt');
    const woff = files.filter((f) => f.endsWith('.woff2'));
    expect(woff).toHaveLength(2);
    const total = woff.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
    expect(total).toBeLessThan(80 * 1024);
    expect(readFileSync(join(dir, 'OFL-AtkinsonHyperlegible.txt'), 'utf8')).toContain(
      'SIL Open Font License, Version 1.1',
    );
    const faces = [...css.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => m[1]!);
    expect(faces).toHaveLength(2);
    for (const f of faces) expect(f).toContain('font-display: optional');
  });
});
