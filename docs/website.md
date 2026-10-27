# Website (apps/web)

A static, read-only React app (Vite, TypeScript, Tailwind) over the generated catalog. It has no backend,
authentication, or install/run capability. Pages have clean URLs (`/skills/caveman`) handled by browser-history
routing; the host must serve `index.html` for them (see [deployment.md](deployment.md#clean-urls-and-the-spa-fallback)).

| Page           | Route           | Purpose                                                                                                                                                                                 |
| -------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home (landing) | `/`             | What the site is for, live registry numbers, the seven lifecycle states, what it does and does not do, links to other projects and to Support                                           |
| Overview       | `/overview`     | Registry totals, third-party review status counts, per-agent evidence totals, recent evidence                                                                                           |
| Skills         | `/skills`       | Searchable library. Filters: category group, source, review status, explicit-run evidence. They combine (all must match) and live in the URL (`/skills?group=Planning&status=approved`) |
| Skill detail   | `/skills/<id>`  | Lifecycle (seven separate states), agent status matrix, provenance, review notes and findings, evidence log, consumers                                                                  |
| Consumers      | `/consumers`    | Consumers with assigned skills first: agents, install mode and verification per assignment; idle consumers listed compactly                                                             |
| Agents & tools | `/integrations` | Agent compatibility totals, what each term means, platform limitations, tools and dependencies                                                                                          |

## URLs and routing

Routing is a small module, `apps/web/src/router.ts`, on the browser History API. There is no routing library.

| URL                           | Shows                                                |
| ----------------------------- | ---------------------------------------------------- |
| `/`                           | Landing page                                         |
| `/overview`                   | Dashboard                                            |
| `/skills`                     | Skills catalog, with optional filter query (below)   |
| `/skills/<id>`                | One skill (`/skills/caveman`); an unknown id says so |
| `/consumers`, `/integrations` | Consumers, Agents & tools                            |
| anything else                 | "Page not found", with links home and to Skills      |

- **Links are ordinary anchors** (`<a href="/skills">`), so they can be opened in a new tab, copied and crawled.
  A click on a same-site link is turned into `history.pushState` (no page reload); modified clicks (Ctrl/Cmd/Shift,
  middle button), `target="_blank"`, downloads, other origins and in-page anchors such as the skip link (`#main`)
  keep their native behaviour. A new page scrolls to the top and moves focus to the content; the browser tab title
  names the page (`Caveman · Ecosystem Skills`). A trailing slash is ignored.
- **Back and Forward** work because every page change is a real history entry, and the app re-reads the address on
  `popstate`.
- **Language and theme** are not routes: switching them never changes the URL, so the current page and its filters
  stay as they are. Both choices persist (`localStorage`) and apply to a deep link opened later.
- **Deployment base path** (`BASE_PATH`, e.g. `/ecosystem-skills/`) is added to every link and removed when reading
  the address.

### Skills filter parameters

The filters live only in the query string, which is the single source of truth: opening a filtered URL restores
them, and Back/Forward step through earlier filter states.

| Parameter | Filter         | Values                                                                         |
| --------- | -------------- | ------------------------------------------------------------------------------ |
| `q`       | Search text    | any text                                                                       |
| `group`   | Category       | Coding, Design, Planning, Communication, Verification, Project-specific, Other |
| `origin`  | Source         | `first-party`, `external`                                                      |
| `status`  | Review status  | `discovered`, `reviewed`, `approved`, `rejected`                               |
| `agent`   | Agent evidence | `any`, `none`, `claude-code`, `codex`                                          |

Example: `/skills?group=Planning&status=approved`. Choosing a filter or clearing them adds a history entry; typing in
the search box replaces the current entry, so Back is not flooded with one step per letter. URLs are written with the
parameters in a fixed order (`q`, `group`, `origin`, `status`, `agent`). Unknown parameters are ignored, and
parameters are never read as path segments.

### Old hash links

The site used hash routes before (`/#/skills/caveman`). Existing bookmarks keep working: on load, and if one is
pasted while the site is open, an old `#/…` link is rewritten in place to its clean URL with `history.replaceState`
(no reload, no extra history entry, so Back leaves the site as it did before and there is no redirect loop).

| Old link                                                      | Becomes                   |
| ------------------------------------------------------------- | ------------------------- |
| `/#/`                                                         | `/`                       |
| `/#/overview`, `/#/consumers`, `/#/integrations`, `/#/skills` | the same path without `#` |
| `/#/skills/caveman`                                           | `/skills/caveman`         |
| `/#/skills?status=approved`                                   | `/skills?status=approved` |

Rules for the edge cases: only the six old routes above are converted. Any other fragment (`#main`, `#details`, an
unknown `#/nonsense`, `#/skills/a/b`) is an ordinary fragment and is left alone, never treated as a route; an
unknown `#/…` therefore shows the landing page, as before. Query parameters inside the old fragment are kept; if the
real query string has the same parameter, the one from the old link wins, and other real parameters are kept. If a
URL has both a path and an old hash (`/overview#/skills`), the old hash wins.

## Status vocabulary

Statuses are derived from `registry/*.json` only (`apps/web/src/lib.ts`). They are kept separate on purpose:

- **Source:** First-party or Third-party (`origin: external` in the registry).
- **Review status** (third-party only): Candidate · discovered / reviewed, Approved, Rejected. First-party skills have no
  third-party review; choose them with the Source filter.
- **Installed / activated:** never shown as yes or no. Installs and project links are per machine and not in the
  catalog, so the skill page says "Not tracked here" and names the command that checks it.
- **Category** is a browsing group (Coding, Design, Planning, Communication, Verification, Project-specific). It is
  derived from the registry `category` through an explicit table in `apps/web/src/lib.ts`, and a skill under
  `skills/projects/` is always Project-specific. A test fails if a category is not placed, so nothing is guessed from
  keywords. The finer registry category stays on the skill page and in search.
- **Discovery** · **Explicit run** · **Natural trigger** · **Behavior** are per agent, from evidence records at the
  currently pinned revision. Natural triggering is a count of runs that loaded the skill; behavior is judged
  separately and never implies the skill was loaded. Older-revision evidence is marked stale and excluded.
- **Assignment verification** is per consumer assignment and appears only where the registry records it.

## Language: English and Bahasa Indonesia

The EN / ID switch in the header translates the **interface**: navigation, headings, filters, statuses, lifecycle
wording, empty states, the landing page and the footer. The choice is stored in `localStorage` (`lang`); without
one, the browser language is used (Indonesian if it is `id…`, otherwise English). `<html lang>` follows the choice.

**Registry content is not translated**: skill descriptions, review findings and evidence notes are data and are
shown as written, in English. The footer says so.

No library is used (`apps/web/src/i18n.tsx`). The English text is the key: `t('Browse skills')`, with `{name}`
placeholders. Indonesian lives in `apps/web/src/locales/id.ts`; a missing entry falls back to the English text. To
change or add wording: use `t('…')` in the component, then add the same text to `id.ts`. A test scans the source and
fails if any interface string lacks an Indonesian entry, if placeholders differ, or if an entry is unused. Product
names and commands (Claude Code, `pnpm skills:verify`) are left as they are. A third language means a new
`locales/<code>.ts` and one entry in `LANGS`.

## Gateway and Help & Contact links

`apps/web/src/links.ts` is the only place these live: `GATEWAY_URL` (`https://fikrimarzuki.work`), `SUPPORT_URL`
(`https://support.fikrimarzuki.work`) and the repository URL. They are site configuration, not registry data.

- **Gateway** is the single entry point to the author's other projects: one wide card on the landing page ("Explore
  More Projects") and one footer link ("Explore more projects"). Individual project links are deliberately not
  listed here; they belong to the Gateway.
- **Help & Contact** (the support site) is for questions, requests for assistance, feedback and getting in touch. It
  is not a donation page, and the site never says otherwise. It appears in the main navigation, as the hero button
  ("Get in touch"), in the landing contact section and in the footer, always with a message icon.

All external links open in a new tab with `rel="noreferrer noopener"` and announce that to screen readers; a test
enforces HTTPS, the author's domain and safe attributes.

## Lifecycle on the skill page

Seven separate facts, shown as a list (not a progress bar) because each can be true without the others:

| State      | Source on this site                               | What it does not mean                     |
| ---------- | ------------------------------------------------- | ----------------------------------------- |
| Registered | the skill is in `registry/skills.json`            | that anyone reviewed it                   |
| Reviewed   | `review.status` is not `unreviewed`               | that anyone decided to allow it           |
| Approved   | `review.status: approved` (owner decision)        | that it is installed                      |
| Installed  | **not tracked here** (machine-local)              | that it is assigned                       |
| Assigned   | an assignment in `registry/consumers.json`        | that a project has the link               |
| Activated  | **not tracked here** (project-local links)        | that an agent loaded or followed it       |
| Verified   | explicit-run evidence in `registry/evidence.json` | natural triggering or a behavioral effect |

The site never infers installation or activation from the registry. "Verified" on a card means an explicit run
(the prompt named the skill) passed at the pinned revision; natural triggering and behavior are separate columns.

## Filters

Search, Category, Source, Review status and Evidence combine with AND. When nothing matches, the page lists the
active filters and offers one-tap removal of any single filter that would bring results back (with the count).
Evidence options are worded as "Explicit run: …" so they cannot be read as a general compatibility claim.

## Design and accessibility notes

- System font stack, zinc neutrals with an indigo-to-fuchsia accent, light and dark themes (follows the system,
  toggle stored locally). The background is a fixed, non-interactive layer (`.app-bg` in `index.css`): pale colour
  glows plus a faint grid that fades out toward the bottom. Surfaces (`.surface`) are near-opaque glass panels, so
  text contrast does not depend on what is behind them. The only motion is a small hover lift on cards, and
  transitions are disabled under reduced motion.
- Contrast is checked against the strongest glow colour, not just the page colour. Gradient text is used only for
  the large landing headline (indigo/violet/fuchsia 700 in light mode, 300 in dark).
- Navigation: the full bar is shown from 1024px; below that the links sit in a scrollable second row. Visually
  hidden text (such as "opens in a new tab") inside that scroller must stay inside it: the list is `relative`, or
  the hidden text would widen the whole page.
- Status text always pairs an icon with words; colour is never the only signal.
- Dense tables sit in a labelled, keyboard-focusable scroll region with a caption, so pages never scroll sideways.
- Skill cards are a single link (the title), with one focus ring on the card. A real `:focus-visible` outline is set
  in plain CSS (Tailwind's outline utility alone left it invisible).
- A skip link moves focus to the main content; navigation marks the current page with `aria-current`.
- Secondary text is `zinc-500` in light mode and `zinc-400` in dark mode: `zinc-500` on the dark background measured
  3.67:1, below the 4.5:1 AA minimum (ES12 fix).

## Checking the site

`pnpm check` covers types, lint, tests (translation completeness, language detection, the landing page, outbound links,
combined filtering, category placement, empty-state explanations, lifecycle
labels, consumer display, status presentation, evidence rendering, navigation, table structure, and public-data
boundaries on the real catalog) and the production build. For a visual check run
`pnpm build && pnpm --filter @ecosystem-skills/web preview` and review the pages at about 320, 375, 768 and 1280 px
in both themes.

**Browser check** (Chromium, built site; first ten pages × four widths × both themes, then extended to the landing page, the dashboard and both languages: 176 combinations): no horizontal overflow, every
control and link has an accessible name, one `h1` per page with no skipped heading levels, a computed text-contrast
estimate, a visible focus indicator on every Tab stop, and the filter and empty-state flows operated by keyboard.
This is a manual-style check, not a complete accessibility audit: no screen reader was used, and no automated
engine such as axe was run.
