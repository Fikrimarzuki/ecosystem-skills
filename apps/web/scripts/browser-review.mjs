#!/usr/bin/env node
/**
 * ES28.2–ES28.5 browser review: real-browser checks for the Command Window pages. Opt-in, not part of `pnpm check`.
 *
 * It needs an existing playwright-core install and its browsers (it adds no dependency to this repository):
 *
 *   pnpm build && pnpm --filter @ecosystem-skills/web preview --port 4319 --strictPort
 *   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
 *     node apps/web/scripts/browser-review.mjs http://127.0.0.1:4319 /tmp/es-review
 *
 * It only reads the site: it never follows external links (it checks their attributes), never contacts an MCP
 * server and writes only into the output directory (report.json and screenshots). Exit code 1 if a check fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [, , BASE = 'http://127.0.0.1:4319', OUT = './browser-review-out'] = process.argv;
if (!process.env.PLAYWRIGHT_CORE) {
  console.error(
    'Set PLAYWRIGHT_CORE to a playwright-core directory (see the header of this file).',
  );
  process.exit(2);
}
const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE);
mkdirSync(`${OUT}/shots`, { recursive: true });

const report = { base: BASE, matrix: [], checks: [] };
const check = (name, ok, detail = '') => report.checks.push({ name, ok: !!ok, detail });

const WIDTHS = [320, 375, 768, 1024, 1280];
/**
 * Every page is converted since ES28.3, so every page is audited in both languages. A fourth entry sets
 * localStorage first (the List views).
 */
const LIST = { 'view.skills': 'list', 'view.resources': 'list', 'view.sources': 'list' };
const PAGES = [
  ['home', '/', true],
  ['skills', '/skills?q=design', true],
  ['skills-empty', '/skills?q=zzz-no-match', true],
  ['resources', '/resources', true],
  ['resources-mcp', '/resources?category=mcp-servers', true],
  ['sources', '/sources', true],
  ['skill', '/skills/frontend-design', true],
  ['skill-partial', '/skills/antislop', true],
  ['resource', '/resources/spec-kit-mcp', true],
  ['overview', '/overview', true],
  ['consumers', '/consumers', true],
  ['integrations', '/integrations', true],
  ['ecosystem', '/ecosystem', true],
  ['skills-list', '/skills?q=design', true, LIST],
  ['resources-list', '/resources', true, LIST],
  ['sources-list', '/sources', true, LIST],
  ['not-found', '/no-such-page', true],
];

async function context(
  browser,
  {
    width = 1280,
    height = 900,
    theme = 'light',
    lang = 'en',
    motion = 'off',
    store = {},
    ...rest
  } = {},
) {
  const ctx = await browser.newContext({ viewport: { width, height }, ...rest });
  await ctx.addInitScript(
    ([theme, lang, motion, store]) => {
      try {
        localStorage.setItem('theme', theme);
        localStorage.setItem('lang', lang);
        if (motion) localStorage.setItem('motion', motion);
        for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v);
      } catch {
        /* storage blocked */
      }
    },
    [theme, lang, motion, store],
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

async function matrix(browser, engine) {
  for (const theme of ['light', 'dark'])
    for (const lang of ['en', 'id'])
      for (const width of engine === 'webkit' ? [375, 1280] : WIDTHS) {
        const ctx = await context(browser, { width, theme, lang });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        for (const [name, path, converted, store] of PAGES) {
          if (lang === 'id' && !converted) continue;
          if (
            engine === 'webkit' &&
            !['home', 'resources', 'sources', 'skill', 'sources-list', 'consumers'].includes(name)
          )
            continue;
          if (store) await page.evaluate((s) => Object.assign(localStorage, s), store);
          await page.goto(BASE + path, { waitUntil: 'networkidle' });
          await page.waitForSelector('main h1');
          const a = await page.evaluate(audit);
          if (store)
            await page.evaluate(
              (s) => Object.keys(s).forEach((k) => localStorage.removeItem(k)),
              store,
            );
          report.matrix.push({ where: `${engine} ${name} ${width}px ${theme} ${lang}`, ...a });
        }
        if (errors.length)
          check(
            `no page errors (${engine} ${width}px ${theme} ${lang})`,
            false,
            errors.slice(0, 2).join(' | '),
          );
        await ctx.close();
      }
}

async function behaviour(browser) {
  // Keyboard on Resources: category link by keyboard, Back/Forward, Cards/List persisted; focus always visible.
  {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
    const invisible = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const v = await page.evaluate(() => {
        const e = document.activeElement;
        const s = getComputedStyle(e);
        const card = e.closest('.cw-item');
        return {
          ok:
            (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) ||
            (card &&
              e.classList.contains('card-link') &&
              getComputedStyle(card).outlineStyle !== 'none'),
          what: `${e.tagName} ${(e.textContent || '').trim().slice(0, 30)}`,
        };
      });
      if (!v.ok) invisible.push(v.what);
    }
    check(
      'resources: every Tab stop shows a focus ring',
      invisible.length === 0,
      invisible.join(' | '),
    );
    await page
      .locator('nav[aria-label="Resource categories"] a', { hasText: 'Agent references' })
      .focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.search.includes('category=agent-references'));
    await page.getByRole('button', { name: 'List' }).click();
    await page.goBack();
    const back = await page.evaluate(() => location.search);
    await page.goForward();
    await page.reload({ waitUntil: 'networkidle' });
    const listKept = await page.getByRole('button', { name: 'List' }).getAttribute('aria-pressed');
    check(
      'resources: category by keyboard, Back/Forward, List view remembered',
      back === '' && listKept === 'true',
      `back="${back}" list=${listKept}`,
    );
    // Sources: decision chip and search.
    await page.goto(`${BASE}/sources`, { waitUntil: 'networkidle' });
    const chip = page.locator('[aria-label="Sources by decision"] button').first();
    await chip.click();
    const pressed = await chip.getAttribute('aria-pressed');
    await page.getByRole('searchbox').fill('anthropic');
    const count = await page.locator('main p[aria-live="polite"]').textContent();
    check(
      'sources: decision chip toggles and search filters',
      pressed === 'true' && /of \d+ sources/.test(count ?? ''),
      `${pressed} "${count}"`,
    );
    await ctx.close();
  }
  // One click to the upstream from detail pages (attribute check; the external site is never opened).
  {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    for (const path of ['/skills/frontend-design', '/skills/antislop', '/resources/spec-kit-mcp']) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      const a = page.locator('a[data-record-source]');
      const ok =
        (await a.count()) === 1 &&
        (await a.getAttribute('target')) === '_blank' &&
        /^https:\/\//.test((await a.getAttribute('href')) ?? '');
      const box = await a.boundingBox();
      check(
        `detail ${path}: upstream one click away, above the fold`,
        ok && box && box.y < 900,
        `${await a.getAttribute('href')} y=${box?.y}`,
      );
    }
    await page.goto(`${BASE}/resources?category=mcp-servers`, { waitUntil: 'networkidle' });
    const endpointLinks = await page.evaluate(
      () =>
        [...document.querySelectorAll('a[href]')].filter((a) =>
          /\/mcp\b|^wss?:|^mcp:/.test(a.getAttribute('href')),
        ).length,
    );
    check('resources: no MCP endpoint is a link', endpointLinks === 0);
    await page.goto(`${BASE}/skills/frontend-design#technical`, { waitUntil: 'networkidle' });
    const y = await page.evaluate(
      () => document.getElementById('technical').getBoundingClientRect().top,
    );
    check(
      'skill detail: "On this page" anchors land on their section',
      y >= 0 && y < 200,
      `top=${y}`,
    );
    await ctx.close();
  }
  // Animation setting persists; reduced motion wins; poses never animate.
  {
    const ctx = await context(browser, { motion: '' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const on = await page.evaluate(() => document.documentElement.dataset.motion);
    await page.getByRole('button', { name: 'Turn animation off' }).click();
    await page.goto(`${BASE}/sources`, { waitUntil: 'networkidle' });
    const off = await page.evaluate(() => document.documentElement.dataset.motion);
    const poseAnimated = await page.evaluate(() =>
      [...document.querySelectorAll('main svg.cw-px *')].some(
        (n) => getComputedStyle(n).animationName !== 'none',
      ),
    );
    check(
      'animation: on by default, off persists across pages, poses never animate',
      on === 'on' && off === 'off' && !poseAnimated,
      `${on} → ${off}`,
    );
    await ctx.close();
    const rm = await context(browser, { motion: '', reducedMotion: 'reduce' });
    const p2 = await rm.newPage();
    await p2.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check(
      'reduced motion: animation off',
      (await p2.evaluate(() => document.documentElement.dataset.motion)) === 'off',
    );
    await rm.close();
  }
  // Touch at 375 px: menu, resource category selector, Sources chips.
  {
    const ctx = await context(browser, { width: 375, height: 812, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Menu' }).tap();
    await page.locator('#site-menu a[href="/sources"]').tap();
    await page.waitForURL('**/sources');
    await page.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
    await page.locator('main select').first().selectOption('agent-toolkits');
    await page.waitForFunction(() => location.search.includes('category=agent-toolkits'));
    check('touch: menu navigation and the phone category selector work', true);
    await ctx.close();
  }
  // Offline: deep links to the converted pages render from the cache with the notice and its pose.
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'allow',
    });
    const page = await ctx.newPage();
    const remote = [];
    page.on('request', (r) => !r.url().startsWith(BASE) && remote.push(r.url()));
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise((r) =>
          navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
        );
    });
    await page.goto(`${BASE}/resources`, { waitUntil: 'networkidle' });
    await ctx.setOffline(true);
    let ok = true;
    for (const path of ['/resources/spec-kit-mcp', '/sources', '/skills/frontend-design']) {
      await page.goto(BASE + path, { waitUntil: 'load' });
      await page.waitForSelector('main h1');
      const notice = await page.locator('[role=status]', { hasText: 'Offline' }).count();
      const pose = await page.locator('[role=status] svg.cw-px').count();
      ok &&= notice === 1 && pose === 1;
    }
    await page.screenshot({ path: `${OUT}/shots/offline-skill-1280-light-en.png` });
    check('offline: deep links render from cache with the notice and the offline pose', ok);
    check('no request leaves the site', remote.length === 0, remote.slice(0, 3).join(' '));
    await ctx.close();
  }
  // Layout shift on a cold load of each converted page.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) =>
        l.getEntries().forEach((e) => !e.hadRecentInput && (window.__cls += e.value)),
      ).observe({ type: 'layout-shift', buffered: true });
    });
    for (const path of [
      '/',
      '/skills',
      '/resources',
      '/sources',
      '/skills/frontend-design',
      '/resources/spec-kit-mcp',
    ]) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const cls = await page.evaluate(() => window.__cls);
      check(`layout shift on cold load of ${path} < 0.05`, cls < 0.05, `CLS=${cls.toFixed(4)}`);
    }
    await ctx.close();
  }
}

/** ES28.3: dropdown truncation, the browser's own table semantics, anchors and the FM Ecosystem notice. */
async function es283(browser) {
  // No select option is cut off once chosen, at any width, in either language (measured with the select's font).
  const cut = [];
  for (const lang of ['en', 'id'])
    for (const width of WIDTHS) {
      const ctx = await context(browser, { width, lang });
      const page = await ctx.newPage();
      for (const path of ['/resources', '/skills']) {
        await page.goto(BASE + path, { waitUntil: 'networkidle' });
        await page.waitForSelector('main h1');
        const filters = page.locator('main button[aria-expanded="false"]', { hasText: /Filter/ });
        if (await filters.isVisible().catch(() => false)) await filters.click();
        cut.push(
          ...(
            await page.evaluate(() => {
              const c = document.createElement('canvas').getContext('2d');
              return [...document.querySelectorAll('main select')]
                .filter((s) => s.offsetParent)
                .flatMap((s) => {
                  const cs = getComputedStyle(s);
                  c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
                  const avail =
                    s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                  return [...s.options]
                    .filter((o) => c.measureText(o.text.trim()).width > avail)
                    .map((o) => `${location.pathname} "${o.text.trim()}"`);
                });
            })
          ).map((x) => `${lang} ${width}px ${x}`),
        );
      }
      await ctx.close();
    }
  check(
    'dropdowns: no option text is cut off (320–1280 px, EN and ID)',
    cut.length === 0,
    cut.slice(0, 4).join(' | '),
  );

  // List views: the browser's accessibility tree (not the markup) has a table with headers on phone and desktop.
  for (const width of [375, 1280]) {
    const ctx = await context(browser, { width, store: LIST });
    const page = await ctx.newPage();
    for (const path of ['/skills?q=design', '/resources', '/sources']) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.waitForSelector('main table');
      const rows = await page.locator('main tbody tr').count();
      const cdp = await ctx.newCDPSession(page);
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      const n = (role) => nodes.filter((x) => !x.ignored && x.role?.value === role).length;
      check(
        `list ${path} ${width}px: table, column headers and one row header per row in the accessibility tree`,
        n('table') >= 1 && n('columnheader') >= 2 && n('rowheader') === rows && n('cell') > 0,
        `tables=${n('table')} colh=${n('columnheader')} rowh=${n('rowheader')}/${rows} cells=${n('cell')}`,
      );
      await cdp.detach();
    }
    await ctx.close();
  }

  // Keyboard: every Tab stop on the four ES28.3 pages shows a visible focus indicator, in both themes.
  for (const theme of ['light', 'dark']) {
    const ctx = await context(browser, { theme });
    const page = await ctx.newPage();
    for (const path of ['/overview', '/consumers', '/integrations', '/ecosystem']) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      const invisible = [];
      for (let i = 0; i < 45; i++) {
        await page.keyboard.press('Tab');
        const v = await page.evaluate(() => {
          const e = document.activeElement;
          const s = getComputedStyle(e);
          return {
            ok:
              e === document.body || (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2),
            what: `${e.tagName} ${(e.textContent || '').trim().slice(0, 30)}`,
          };
        });
        if (!v.ok) invisible.push(v.what);
      }
      check(
        `keyboard ${path} ${theme}: every Tab stop shows focus`,
        invisible.length === 0,
        invisible.slice(0, 3).join(' | '),
      );
    }
    await ctx.close();
  }

  // Consumers: a build card anchor lands on its card; FM Ecosystem says "not installable" before any skill.
  {
    const ctx = await context(browser, { width: 375 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/consumers#consumer-gateway`, { waitUntil: 'networkidle' });
    const y = await page.evaluate(
      () => document.getElementById('consumer-gateway').getBoundingClientRect().top,
    );
    check(
      'consumers: /consumers#consumer-gateway lands on the Gateway build',
      y >= 0 && y < 200,
      `top=${y}`,
    );
    await page.goto(`${BASE}/ecosystem`, { waitUntil: 'networkidle' });
    const order = await page.evaluate(() => {
      const t = document.querySelector('main').innerText;
      return [
        t.indexOf('Public to read does not mean public to install'),
        t.indexOf('Ecosystem Assets'),
      ];
    });
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('main a[href^="http"]')].every(
        (a) => a.target === '_blank' && /noopener/.test(a.rel),
      ),
    );
    check(
      'ecosystem: "public to read is not public to install" comes before the skills; source links are safe',
      order[0] > 0 && order[0] < order[1] && links,
      order.join(' < '),
    );
    await ctx.close();
  }
}

/** ES28.5: the Living Library landing page, in a real browser: signs, keyboard, touch, motion and offline. */
async function landing(browser) {
  // keyboard: the four signs are Tab stops with a visible ring; Enter opens one
  for (const theme of ['light', 'dark']) {
    const ctx = await context(browser, { theme });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const seen = new Set();
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
          what: `${e.tagName} ${(e.textContent || '').trim().slice(0, 24)}`,
        };
      });
      if (v.spot) seen.add(v.spot);
      if (!v.ok) invisible.push(v.what);
    }
    check(
      `landing ${theme}: every Tab stop shows focus`,
      invisible.length === 0,
      invisible.slice(0, 3).join(' | '),
    );
    check(`landing ${theme}: the four signs are Tab stops`, seen.size === 4, [...seen].join(','));
    await page.locator('.lp-wide .lp-spot[data-spot="sources"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/sources$/);
    await ctx.close();
  }
  check('landing: Enter on a sign opens its catalog', true);
  // touch: tapping a sign opens it, without hover
  {
    const ctx = await context(browser, { width: 375, height: 812, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const box = await page.locator('.lp-phone .lp-spot[data-spot="ecosystem"]').boundingBox();
    await page.locator('.lp-phone .lp-spot[data-spot="ecosystem"]').tap();
    await page.waitForURL(/\/ecosystem$/);
    check(
      'landing touch: a tap on a sign opens it; targets at least 44 px',
      box.width >= 44 && box.height >= 44,
      JSON.stringify(box),
    );
    await ctx.close();
  }
  // motion: reduced motion stops everything; the setting is on by default with finite loops, and off persists
  {
    const rm = await context(browser, { motion: '', reducedMotion: 'reduce' });
    const p1 = await rm.newPage();
    await p1.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const r = await p1.evaluate(() => ({
      m: document.documentElement.dataset.motion,
      n: document.getAnimations().length,
    }));
    check(
      'landing reduced motion: nothing animates',
      r.m === 'off' && r.n === 0,
      JSON.stringify(r),
    );
    await rm.close();
    const ctx = await context(browser, { motion: '' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const on = await page.evaluate(() => {
      const a = document.getAnimations();
      return {
        n: a.length,
        infinite: a.filter((x) => x.effect.getComputedTiming().iterations === Infinity).length,
      };
    });
    check(
      'landing animation: on by default, every loop finite',
      on.n > 0 && on.infinite === 0,
      JSON.stringify(on),
    );
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
    check(
      'landing animation: smooth (95th percentile frame under 34 ms)',
      frames.p95 < 34,
      JSON.stringify(frames),
    );
    await page.getByRole('button', { name: 'Turn animation off' }).click();
    await page.reload({ waitUntil: 'networkidle' });
    const off = await page.evaluate(() => ({
      m: document.documentElement.dataset.motion,
      n: document.getAnimations().length,
    }));
    check(
      'landing animation: off persists after reload and stops everything',
      off.m === 'off' && off.n === 0,
      JSON.stringify(off),
    );
    const dom = await page.evaluate(() => ({
      nodes: document.querySelectorAll('*').length,
      paths: document.querySelectorAll('.lp-canvas path').length,
    }));
    report.landingDom = dom;
    await ctx.close();
  }
  // offline: the landing page itself renders from the cache, art and signs included
  {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'networkidle' });
    await ctx.setOffline(true);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const ok = await page
      .waitForSelector('.lp-wide svg path', { timeout: 8000 })
      .then(() =>
        page.evaluate(
          () =>
            document.querySelectorAll('.lp-spot').length === 8 && !!document.querySelector('h1'),
        ),
      )
      .catch(() => false);
    await page.screenshot({ path: `${OUT}/shots/offline-home-1280-light-en.png` });
    check('offline: the landing page renders from the cache with its room and signs', ok);
    await ctx.close();
  }
}

async function screenshots(browser) {
  const shots = [
    ['resources', '/resources', 1280, 'light', 'en'],
    ['resources', '/resources', 1280, 'dark', 'en'],
    [
      'resources-list',
      '/resources?category=mcp-servers',
      1280,
      'dark',
      'en',
      { 'view.resources': 'list' },
    ],
    ['resources', '/resources', 375, 'light', 'id'],
    ['resources-empty', '/resources?q=zzz', 375, 'dark', 'en'],
    ['sources', '/sources', 1280, 'light', 'en'],
    ['sources', '/sources', 1280, 'dark', 'en'],
    ['sources-list', '/sources', 1280, 'light', 'en', { 'view.sources': 'list' }],
    ['sources', '/sources', 375, 'dark', 'id'],
    ['skill', '/skills/frontend-design', 1280, 'light', 'en'],
    ['skill', '/skills/frontend-design', 1280, 'dark', 'en'],
    ['skill-partial', '/skills/antislop', 1280, 'light', 'en'],
    ['skill', '/skills/frontend-design', 375, 'dark', 'id'],
    ['resource', '/resources/spec-kit-mcp', 1280, 'light', 'en'],
    ['resource', '/resources/spec-kit-mcp', 1280, 'dark', 'en'],
    ['resource', '/resources/spec-kit-mcp', 375, 'light', 'id'],
    ['home', '/', 1280, 'light', 'en'],
    ['skills', '/skills?q=design', 1280, 'dark', 'en'],
    ['not-found', '/no-such-page', 375, 'light', 'en'],
    // ES28.5 landing page
    ['home', '/', 1280, 'dark', 'id'],
    ['home', '/', 768, 'light', 'en'],
    ['home', '/', 375, 'light', 'en'],
    ['home', '/', 375, 'dark', 'id'],
    ['home', '/', 320, 'dark', 'en'],
    // ES28.3
    ['overview', '/overview', 1280, 'light', 'en'],
    ['overview', '/overview', 1280, 'dark', 'en'],
    ['overview', '/overview', 375, 'light', 'id'],
    ['consumers', '/consumers', 1280, 'light', 'en'],
    ['consumers', '/consumers', 375, 'dark', 'id'],
    ['integrations', '/integrations', 1280, 'dark', 'en'],
    ['integrations', '/integrations', 375, 'light', 'en'],
    ['ecosystem', '/ecosystem', 1280, 'light', 'id'],
    ['ecosystem', '/ecosystem', 375, 'dark', 'en'],
    ['skills-list', '/skills?q=design', 375, 'light', 'id', LIST],
  ];
  for (const [name, path, width, theme, lang, store = {}] of shots) {
    const ctx = await context(browser, {
      width,
      height: width < 500 ? 812 : 900,
      theme,
      lang,
      store,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.waitForSelector('main h1');
    await page.screenshot({ path: `${OUT}/shots/${name}-${width}-${theme}-${lang}.png` });
    if (['skill', 'resource'].includes(name) && width === 1280 && theme === 'light')
      await page.screenshot({
        path: `${OUT}/shots/${name}-${width}-${theme}-${lang}-full.png`,
        fullPage: true,
      });
    await ctx.close();
  }
}

const cr = await chromium.launch();
await matrix(cr, 'chromium');
await behaviour(cr);
await es283(cr);
await landing(cr);
await screenshots(cr);
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
const under40 = report.matrix
  .filter((m) => /(320|375)px/.test(m.where))
  .reduce((n, m) => n + m.under40, 0);
console.log(
  `audits ${report.matrix.length} | checks ${report.checks.length - failed.length}/${report.checks.length} passed | phone targets under 40px: ${under40}`,
);
for (const c of report.checks) console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail);
process.exit(failed.length ? 1 : 0);
