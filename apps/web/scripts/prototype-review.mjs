#!/usr/bin/env node
/**
 * ES28.4 prototype review: real-browser checks for the landing prototypes (since ES28.5 only Concept B, a
 * development reference; the chosen Concept A is the landing page and is checked by browser-review.mjs). Opt-in, not part of `pnpm check`, and
 * it needs a build made with the prototype flag (the normal build has no prototypes):
 *
 *   VITE_LANDING_PROTOTYPES=1 pnpm --filter @ecosystem-skills/web exec vite build --outDir /tmp/es-proto --emptyOutDir
 *   pnpm --filter @ecosystem-skills/web exec vite preview --outDir /tmp/es-proto --port 4321 --strictPort
 *   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
 *     node apps/web/scripts/prototype-review.mjs http://localhost:4321 /tmp/es-proto-review
 *
 * It only reads the site (it never follows external links), adds no dependency, and writes report.json and
 * screenshots into the output directory. The in-page audit is the one browser-review.mjs uses. Exit 1 on a failure.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [, , BASE = 'http://localhost:4321', OUT = './prototype-review-out'] = process.argv;
if (!process.env.PLAYWRIGHT_CORE) {
  console.error(
    'Set PLAYWRIGHT_CORE to a playwright-core directory (see the header of this file).',
  );
  process.exit(2);
}
const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE);
mkdirSync(`${OUT}/shots`, { recursive: true });
const report = { base: BASE, matrix: [], checks: [], perf: {} };
const check = (name, ok, detail = '') => report.checks.push({ name, ok: !!ok, detail });
const WIDTHS = [320, 375, 768, 1024, 1280];
// ES28.5: Concept A is the landing page (browser-review.mjs checks it); Concept B remains a development reference.
const CONCEPTS = [['b', '/_prototypes/archive-overworld']];
const origin = new URL(BASE).origin;

async function context(
  browser,
  { width = 1280, height = 900, theme = 'light', lang = 'en', motion = 'off', ...rest } = {},
) {
  const ctx = await browser.newContext({ viewport: { width, height }, ...rest });
  await ctx.addInitScript(
    ([theme, lang, motion]) => {
      try {
        localStorage.setItem('theme', theme);
        localStorage.setItem('lang', lang);
        if (motion) localStorage.setItem('motion', motion);
      } catch {
        /* storage blocked */
      }
    },
    [theme, lang, motion],
  );
  return ctx;
}

/** Runs in the page: overflow, headings, contrast estimate, art exposure, unnamed controls, small targets. */
function audit() {
  const lum = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return { L: 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b), a };
  };
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const b = lum(getComputedStyle(e).backgroundColor);
      if (b && b.a >= 0.95) return b.L;
    }
    return lum(getComputedStyle(document.body).backgroundColor).L;
  };
  const low = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[aria-hidden="true"], .sr-only, svg')) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (!r.width || !r.height || s.visibility === 'hidden' || +s.opacity === 0) continue;
    const fg = lum(s.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const ratio = (Math.max(fg.L, bg) + 0.05) / (Math.min(fg.L, bg) + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
    if (ratio < (large ? 3 : 4.5))
      low.push(`${ratio.toFixed(2)} "${el.textContent.trim().slice(0, 40)}"`);
  }
  const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
  const visible = (e) => e.offsetParent || getComputedStyle(e).position === 'fixed';
  const targets = [
    ...document.querySelectorAll(
      'header button, header a, main button, main select, main input, main a.btn-primary, main a.btn-secondary',
    ),
  ]
    .filter(visible)
    .map((e) => e.getBoundingClientRect());
  return {
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    h1: levels.filter((l) => l === 1).length,
    skipped: levels.some((l, i) => i > 0 && l > levels[i - 1] + 1),
    low: low.slice(0, 6),
    lowCount: low.length,
    artExposed: [...document.querySelectorAll('svg.cw-px')].filter(
      (s) => s.getAttribute('aria-hidden') !== 'true',
    ).length,
    unnamed: [...document.querySelectorAll('a[href], button, input, select')].filter(
      (e) =>
        !(e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || '').trim() &&
        !e.labels?.length &&
        !e.closest('label'),
    ).length,
    under24: targets.filter((r) => r.height < 24 || r.width < 24).length,
    under40: targets.filter((r) => r.height < 40).length,
  };
}

/** Visible scene destinations and their plates, measured in the page. */
function spots() {
  return [...document.querySelectorAll('.lp-spot')]
    .filter((a) => a.offsetParent)
    .map((a) => {
      const r = a.getBoundingClientRect();
      const p = a.querySelector('.lp-plate').getBoundingClientRect();
      return {
        id: a.dataset.spot,
        w: r.width,
        h: r.height,
        plateInside: p.left >= -1 && p.right <= innerWidth + 1,
      };
    });
}

async function matrix(browser, engine) {
  for (const theme of ['light', 'dark'])
    for (const lang of ['en', 'id'])
      for (const width of engine === 'webkit' ? [375, 1280] : WIDTHS) {
        const ctx = await context(browser, { width, theme, lang });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        for (const [c, path] of CONCEPTS) {
          await page.goto(BASE + path, { waitUntil: 'networkidle' });
          await page.waitForSelector('.lp-spot', { state: 'attached' });
          const a = await page.evaluate(audit);
          const s = await page.evaluate(spots);
          report.matrix.push({
            where: `${engine} ${c} ${width}px ${theme} ${lang}`,
            ...a,
            spots: s,
          });
          if (s.length !== 4 || s.some((x) => x.w < 44 || x.h < 44 || !x.plateInside))
            check(
              `${engine} ${c} ${width}px ${theme} ${lang}: 4 destinations, 44 px targets, plates on screen`,
              false,
              JSON.stringify(s),
            );
        }
        if (errors.length)
          check(
            `no console or page errors (${engine} ${width}px ${theme} ${lang})`,
            false,
            errors.slice(0, 2).join(' | '),
          );
        await ctx.close();
      }
}

async function behaviour(browser) {
  for (const [c, path] of CONCEPTS) {
    // keyboard: the scene's four places are Tab stops with a visible ring on the plate; Enter follows the link
    {
      const ctx = await context(browser);
      const page = await ctx.newPage();
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      const seen = [];
      const invisible = [];
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        const v = await page.evaluate(() => {
          const e = document.activeElement;
          const ring = (el) => {
            const s = getComputedStyle(el);
            return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
          };
          const plate = e.closest('.lp-spot')?.querySelector('.lp-plate');
          return {
            spot: e.closest('.lp-spot')?.dataset.spot,
            ok: e === document.body || ring(plate ?? e),
            what: e.tagName + ' ' + (e.textContent || '').trim().slice(0, 24),
          };
        });
        if (v.spot) seen.push(v.spot);
        if (!v.ok) invisible.push(v.what);
      }
      check(
        `${c} keyboard: every Tab stop shows focus`,
        invisible.length === 0,
        invisible.slice(0, 3).join(' | '),
      );
      check(
        `${c} keyboard: the four places are Tab stops`,
        new Set(seen).size === 4,
        [...new Set(seen)].join(','),
      );
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.locator('.lp-wide .lp-spot[data-spot="sources"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/sources$/);
      check(`${c} keyboard: Enter on a place opens it`, true);
      await ctx.close();
    }
    // touch: a tap on a place navigates (no hover needed)
    {
      const ctx = await context(browser, {
        width: 375,
        height: 812,
        hasTouch: true,
        isMobile: true,
      });
      const page = await ctx.newPage();
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.locator('.lp-phone .lp-spot[data-spot="skills"]').tap();
      await page.waitForURL(/\/skills$/);
      check(`${c} touch: a tap on a place opens it`, true);
      await ctx.close();
    }
    // motion: off with reduced motion; on by default and every animation finite; the setting persists
    {
      const rm = await context(browser, { motion: '', reducedMotion: 'reduce' });
      const p1 = await rm.newPage();
      await p1.goto(BASE + path, { waitUntil: 'networkidle' });
      const r = await p1.evaluate(() => ({
        m: document.documentElement.dataset.motion,
        n: document.getAnimations().length,
      }));
      check(
        `${c} reduced motion: animation off, nothing animates`,
        r.m === 'off' && r.n === 0,
        JSON.stringify(r),
      );
      await rm.close();
      const ctx = await context(browser, { motion: '' });
      const page = await ctx.newPage();
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      const on = await page.evaluate(() => {
        const a = document.getAnimations();
        return {
          m: document.documentElement.dataset.motion,
          n: a.length,
          infinite: a.filter((x) => x.effect.getComputedTiming().iterations === Infinity).length,
        };
      });
      check(
        `${c} animation: on by default, every loop finite`,
        on.m === 'on' && on.n > 0 && on.infinite === 0,
        JSON.stringify(on),
      );
      await page.getByRole('button', { name: 'Turn animation off' }).click();
      await page.reload({ waitUntil: 'networkidle' });
      const off = await page.evaluate(() => ({
        m: document.documentElement.dataset.motion,
        n: document.getAnimations().length,
      }));
      check(
        `${c} animation: off persists after reload and stops everything`,
        off.m === 'off' && off.n === 0,
        JSON.stringify(off),
      );
      // frame pacing while moving across the four places (hover), animation on
      await page.getByRole('button', { name: 'Turn animation on' }).click();
      const frames = await page.evaluate(async () => {
        const d = [];
        let last = performance.now();
        let run = true;
        const tick = (t) => {
          d.push(t - last);
          last = t;
          if (run) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        await new Promise((res) => setTimeout(res, 2400));
        run = false;
        d.sort((a, b) => a - b);
        return { frames: d.length, p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1] };
      });
      for (const id of ['skills', 'resources', 'sources', 'ecosystem'])
        await page.locator(`.lp-wide .lp-spot[data-spot="${id}"]`).hover();
      report.perf[`${c} frames (2.4 s, idle scene, animation on)`] = frames;
      check(
        `${c} animation: smooth (95th percentile frame under 34 ms)`,
        frames.p95 < 34,
        JSON.stringify(frames),
      );
      await ctx.close();
    }
    // layout shift on a cold load, and no request leaves the site
    {
      const ctx = await context(browser);
      const page = await ctx.newPage();
      const remote = [];
      page.on(
        'request',
        (r) => !r.url().startsWith(origin) && !r.url().startsWith('data:') && remote.push(r.url()),
      );
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const cls = await page.evaluate(() => window.__cls);
      report.perf[`${c} CLS`] = cls;
      check(`${c} layout shift on cold load < 0.05`, cls < 0.05, `CLS=${cls.toFixed(4)}`);
      const nav = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
        return {
          domContentLoaded: Math.round(n.domContentLoadedEventEnd),
          load: Math.round(n.loadEventEnd),
          lcp: lcp ? Math.round(lcp.startTime) : null,
        };
      });
      report.perf[`${c} load (ms, local preview)`] = nav;
      check(`${c} no request leaves the site`, remote.length === 0, remote.slice(0, 3).join(' '));
      await ctx.close();
    }
  }
  // offline: after one visit the preview's service worker serves both prototypes (with art) without a network
  {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    await page.goto(BASE + CONCEPTS[0][1], { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'networkidle' });
    await ctx.setOffline(true);
    let ok = true;
    for (const [c, path] of CONCEPTS) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      const r = await page
        .waitForSelector('.lp-wide svg path', { timeout: 8000 })
        .then(() =>
          page.evaluate(() => ({
            h1: document.querySelector('h1')?.textContent,
            spots: document.querySelectorAll('.lp-spot').length,
          })),
        )
        .catch((e) => ({ error: String(e) }));
      if (!r.h1 || r.spots !== 8) ok = false;
      await page.screenshot({ path: `${OUT}/shots/offline-${c}.png` });
      report.perf[`offline ${c}`] = r;
    }
    check('offline: both prototypes render from the cache with their art and places', ok);
    await ctx.close();
  }
}

const cr = await chromium.launch();
await matrix(cr, 'chromium');
await behaviour(cr);
await cr.close();
const wk = await webkit.launch();
await matrix(wk, 'webkit');
await wk.close();

for (const m of report.matrix) {
  const bad = [
    m.overflow && 'overflow',
    m.h1 !== 1 && `h1=${m.h1}`,
    m.skipped && 'skipped heading',
    m.lowCount && `${m.lowCount} low contrast ${m.low.join(' | ')}`,
    m.artExposed && 'art exposed',
    m.unnamed && `${m.unnamed} unnamed`,
    m.under24 && `${m.under24} targets < 24px`,
  ].filter(Boolean);
  if (bad.length) check(`audit ${m.where}`, false, bad.join('; '));
}
const failed = report.checks.filter((c) => !c.ok);
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
console.log(
  `audits ${report.matrix.length} | checks ${report.checks.length - failed.length}/${report.checks.length} passed`,
);
for (const c of report.checks) console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail);
console.log(JSON.stringify(report.perf, null, 1));
process.exit(failed.length ? 1 : 0);
