# Command Window design system (ES28)

The visual language of the Ecosystem Skills website: a modern 2D pixel-RPG treatment over a developer catalog. The
owner chose this direction (Concept 1, "Command Window") from [rpg-redesign-discovery.md](rpg-redesign-discovery.md).
This document is the reference for every page. Change it before changing the code, and keep the two in step.

Sources of truth:

- **Tokens and components:** `apps/web/src/index.css`.
- **Art (sprites, glyphs, wordmark):** `apps/web/src/art.tsx`. **The landing room (ES28.5):** `apps/web/src/landing/`
  (`library.tsx` the room, `stage.tsx` the signs and headline, `pixel.tsx` the painter, `landing.css` its palette).
- **Animation setting:** `apps/web/src/motion.tsx` and the inline script in `apps/web/index.html`.
- **Mechanical checks:** `apps/web/src/es28.test.tsx`, `es282.test.tsx` and `es283.test.tsx`.

The approved `frontend-design` skill (installed, not linked into this repository) was used as a read-only design
reference. Its rules that apply here are written into this document, so it is not needed to follow it.

## 1. The idea in one paragraph

The site is the menu screen of an archivist's journey. Every panel is a **window** with a notched pixel frame. Keyboard
focus and the current page are marked by a small **pixel pointer**. The **Archivist** keeps the records in an archive
room on the landing page. Everything you read — names, sources, revisions, licences, statuses, findings — stays in a
calm, highly legible typeface at full contrast. The pixel world frames the catalog; it never replaces or hides it.

## 2. Two layers

| Layer  | What belongs to it                                                                                                                                                                                            | Rules                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| World  | The Archivist, the landing room, glyphs, the wordmark, frames, the pointer, the page dither                                                                                                                   | Decorative. `aria-hidden="true"` and `focusable="false"` on every SVG. Never the only place a fact appears |
| Record | Skill and resource names, descriptions, repository and source links, pinned revisions, licences, provenance, review and approval status, audits, install and assignment state, MCP and resource types, counts | Body typeface, full contrast, never pixel type, never inside artwork, never animated                       |

Every fact the world layer hints at is also written as text. The landing room's signs (a real link each: "Skill
Codex · 264 skills") and the counts line under the headline ("264 skills · 17 resources · 76 sources, all
read-only.") are the model.

## 3. Security status is never a game mechanic

Hard rules. `es28.test.tsx` checks the first two on every build.

- Every catalog panel uses **the same frame** whatever its review status, approval, source or owner.
- No **rarity, level, XP, power, loot, achievement or unlock** wording or visuals. That includes tiered frame colours
  (grey/green/blue/purple/gold), stars, glows on Approved, progress bars or meters, and celebrations.
- Status stays a **badge with words** from the existing vocabulary (`STAGE_LABEL` and friends), with colour as a second
  signal, never the only one. Badges are status, not decoration: do not restyle them per concept.
- The **lifecycle** stays seven separate facts in a list, never a path, a bar or a sequence of unlocks.
- The **skill tree** is a map of browsing categories with counts. Every node is a plain link to the filtered catalog.
  Nothing in it is locked, unlocked, earned or ordered by merit. The hint text says so.
- The **Archivist never reacts** to a status: it does not cheer for Approved or frown at Rejected.
- **MCP endpoints and connection details are never links or buttons.** The site does not connect to anything.

## 4. Colour tokens

Defined on `:root` (light) and `html.dark` (dark) in `index.css`. Components use the tokens, never raw colours.

| Token                  | Light             | Dark                  | Use                                                                               |
| ---------------------- | ----------------- | --------------------- | --------------------------------------------------------------------------------- |
| `--cw-page`            | `#edf0f5`         | `#0f1320`             | Page background (with a faint dither that fades downward)                         |
| `--cw-window`          | `#fbfcfe`         | `#1a2030`             | Window fill, header, footer                                                       |
| `--cw-sunken`          | `#f1f3f8`         | `#141a28`             | Slots, hovered rows, captions                                                     |
| `--cw-ink`             | `#1f2638`         | `#e8ecf5`             | Text                                                                              |
| `--cw-muted`           | `#4f5669`         | `#a8b0c3`             | Secondary text (≥ 4.5:1 on window and page)                                       |
| `--cw-edge`            | `#1f2638`         | `#6b7aa3`             | Frame outline, control borders                                                    |
| `--cw-hi` / `--cw-lo`  | white / `#c6cddb` | `#2c3550` / `#0b0e18` | Bevel highlight and shade                                                         |
| `--cw-signal`          | `#0e7782`         | `#5cc8d1`             | The one interactive accent: primary buttons, pressed toggles, current page, links |
| `--cw-gold`            | `#f0a202`         | `#ffc433`             | The pointer and the ledger's glow only                                            |
| `--cw-mark-bg` / `-fg` | `#fde68a` / ink   | `#6b5a12` / `#fff8dc` | Search highlight                                                                  |

Rules:

- **One accent.** Signal is the only interactive colour. Gold appears only in the pointer and the Archivist's ledger;
  it never marks a status, a count or a "best" item.
- **Status colours are separate** (the existing emerald / amber / red / neutral badge tones in `ui.tsx`) and keep their
  meaning on every page.
- Tailwind `signal-*` utilities carry the accent ramp, and the `signal` badge tone uses them. The ES28 bridge that
  mapped `indigo-*` onto `signal-*` was removed in ES28.2 once no page used `indigo-*`; a test fails if any page
  renders `indigo-`, `violet-` or `fuchsia-` again. `zinc-500` stays one notch darker (`#5c5c66`) for the pages that
  still use zinc utilities, so their secondary text keeps 4.5:1 on the tinted page.

## 5. Typography

- **Atkinson Hyperlegible** (400, 700), self-hosted, SIL OFL 1.1, latin subset, 34.7 KB in total
  (`src/assets/fonts/README.md`). `font-display: optional` plus build-time preload: no late swap, no reflow.
- Fallback stack: `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`. Monospace stays the system
  stack (revisions, hashes, commands).
- **Pixel type is used once:** the "Ecosystem Skills" wordmark on the landing page, drawn from an original 8-row bitmap
  face in `art.tsx`: above the headline on phones, written on the room's hanging scroll from 640 to 1139 px (where
  the headline sits above the room), and not shown from 1140 px (the headline is on the scroll). It is decorative;
  the name is also real text in the header. Never set headings, labels, data or translatable text in pixel type.
- Weights: 400 for text, 700 for headings, names, labels that need weight and badges. There is no 500 or 600.
- Avoid: all-caps labels, appended arrows on buttons and links, one accented word inside a headline, gradient text.

## 6. Components

| Class or component                | What it is                                                                                          | Use it for                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `.surface`                        | A window: notched 4 px pixel frame (`border-image`), opaque fill, 3 px hard drop shadow             | Every panel. It never clips content or focus rings                                                                                          |
| `.surface-hover`                  | The drop shadow turns signal on hover and focus-within. No lift, no motion                          | Panels that are one link (stats, catalog paths, cards)                                                                                      |
| `Window` (`ui.tsx`)               | A `.surface` with its title as a tab on the top edge (`.cw-tab`, a real heading)                    | Dashboard windows (Overview) and the FM Ecosystem notice. Not inside scroll containers (the tab would clip); never nested in another window |
| `.cw-item`                        | Inventory panel: one visible ring on the whole card when its stretched link has keyboard focus      | Skill cards now; resource and source cards next                                                                                             |
| `.cw-slot` / `GlyphSlot`          | A 44 px sunken square holding a glyph at 3× (`GlyphSlot` in `art.tsx`)                              | Category, catalog, agent, consumer and integration symbols beside a name                                                                    |
| `.cw-record`                      | Dashed rule above the record strip (source, licence, evidence)                                      | The bottom of every inventory panel                                                                                                         |
| `.cw-pointer`                     | Pixel pointer shown to the left on hover and keyboard focus                                         | Buttons, panel links, tree nodes. Needs 15 px of free space on its left                                                                     |
| `.cw-nav`                         | Main navigation: the current page gets the pointer inside the link and a signal underline           | Header and mobile menu                                                                                                                      |
| `.btn-primary` / `.btn-secondary` | Square buttons, 2 px edge, hard shadow that presses on `:active`                                    | One primary per view                                                                                                                        |
| `.cw-tool`                        | Small square header tool (theme, animation, menu)                                                   | Header only                                                                                                                                 |
| `.control`                        | Inputs and selects: square, 2 px edge, sunken bevel, one chevron                                    | Every form control                                                                                                                          |
| `.cw-mark`                        | Search highlight: marker band with a gold underline                                                 | `<mark>` from `highlight.tsx` only                                                                                                          |
| `.cw-rule`                        | Dashed signal rule under page titles                                                                | `PageHeader` only                                                                                                                           |
| `.cw-tree`                        | Category map with a trunk and branches (decoration only)                                            | The landing skill tree                                                                                                                      |
| `.cw-chip`                        | Square chip link for a related item                                                                 | Related skills and resources on cards and detail pages                                                                                      |
| `.cw-side`                        | With `.cw-nav` on a menu inside a window: the pointer sits in the window padding                    | The Resources category sidebar                                                                                                              |
| `RecordSummary` (`shared.tsx`)    | The strip under a detail title: key facts plus the verified source as a button showing its address  | Every skill and resource detail page (the source is one click away)                                                                         |
| `UrlText` (`shared.tsx`)          | A URL without its scheme, with line-break opportunities after each `/`                              | Visible text of every repository and source link                                                                                            |
| `Section` `icon`                  | Optional glyph before a section heading (decorative; the heading text names the section)            | Resource category sections                                                                                                                  |
| `Empty` `pose`                    | An empty state with an Archivist pose beside the explanation                                        | No results, page not found                                                                                                                  |
| `PageHeader` `kicker`             | The page's Command Window name above the familiar title, with a 2× glyph (ES28.3)                   | Overview, Consumers, Agents & tools, FM Ecosystem. The `h1` keeps the navigation wording                                                    |
| `Ledger` (`ui.tsx`), `.cw-ledger` | A real table: caption, column headers, one row header per item; stacks into labelled lines < 768 px | The List views of Skills, Resources and Sources                                                                                             |

Spacing: grids that hold `.cw-pointer` panels use a gap of at least 16 px (`gap-4`) so the pointer never covers a
neighbour. Panels use 16–28 px padding; on phones the landing windows drop to 12–16 px.

Inventory and archive cards (ES28.2):

- **Resource cards** (inventory): category glyph slot, name as the card's stretched link, the type written out, status
  badges, summary, then the record strip: publisher and licence, and the verified original source as a visible link
  that shows its address (`title="Original source of …"`). The source link sits above the stretched link
  (`relative z-10`), so it is separately clickable and focusable; the card ring appears only when the title link has
  focus (`.cw-item:has(.card-link:focus-visible)`).
- **Source cards** (archive records): shelf glyph, name, decision/kind/identity badges, summary, then the record
  strip with plain labels in this order: Repository (or Upstream when it is not a code host), Publisher, Revision
  examined, License, Last commit seen, counts; then registered skills and catalogued resources as chips; warnings are
  open when there are three or fewer. Source cards have no stretched link: every link in them is its own target.
- **Ledger tables** (List view, ES28.3): a real `<table>` (`Ledger`) with a visually hidden caption, column headers
  (`th scope="col"`) and the item name as the row header (`th scope="row"`), so screen readers announce the column
  and the item for every value. Dashed row separators, no uppercase, the source link in its own column. Below 768 px
  each row stacks: the header row is visually hidden but still read, and each cell shows its column name from
  `data-label` (CSS generated text with empty alternative text, so it is not read twice). Explicit ARIA roles keep
  the table semantics when the stacked layout changes `display`. Checked in the browser's accessibility tree by the
  browser review.

## 7. The Archivist and other art

All art is original, authored in `art.tsx` as palette-indexed text grids and rendered as inline SVG with
`shape-rendering: crispEdges`. There are no image files, nothing is fetched and nothing is cached separately.

**Grid rules:** `.` is transparent; a lowercase letter is a palette index drawn with `--px-<letter>`; the same letter in
uppercase is its shade, `--px-<letter>2`. Light and dark themes redefine the variables, never the art. Every row in a
grid has the same width, and every letter used has a light and a dark token (both tested).

| Letter  | Meaning                         | Light                 | Dark                            |
| ------- | ------------------------------- | --------------------- | ------------------------------- |
| `o`     | Outline (glyphs: light in dark) | `#1f2638`             | `#070a12` (`#c3cbe0` on glyphs) |
| `h`/`H` | Hood                            | `#3f5a8c` / `#2c4268` | `#5a78b0` / `#3f5a8c`           |
| `k`/`K` | Skin                            | `#f2c9a0` / `#d99e74` | `#f5d0a9` / `#d9a77c`           |
| `e`     | Eyes                            | ink                   | ink                             |
| `r`     | Blush                           | `#e8907e`             | `#e8907e`                       |
| `l`/`L` | Ledger cover, boots             | `#7a4b2a` / `#5a3519` | `#8a5a36` / `#5f3b20`           |
| `p`/`P` | Pages, ruled lines              | `#fff6dc` / `#e3d3a6` | `#fff2c4` / `#e0c47a`           |
| `g`/`G` | Ledger glow                     | `#ffcf4a` / `#f0a202` | `#ffe07a` / `#ffc433`           |
| `s`/`S` | Signal details in glyphs        | `#0e7782` / `#0b5f68` | `#5cc8d1` / `#3fb0b9`           |

**The Archivist** is a friendly hooded keeper of records, 16 × 24 at native size: a rounded hood with a point, an open
face with two dot eyes and blush, a robe, two hands holding an open ledger whose pages glow. Three frame layers:
`cw-bob` (1 px breathing), `cw-glow` (the light above the ledger shimmers), `cw-blink`.

**Poses** (ES28.2, `POSES` in `art.tsx`) are built from the base grid by replacing whole rows, so the hood top (rows
0–6), robe hem and boots (rows 18–23), palette and proportions never change (tested). They are still images: they sit
next to text people are reading, so they never animate.

| Pose        | What changes                                                  | Where it is used                                               |
| ----------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `idle`      | The base: open glowing ledger                                 | The 32 × 48 landing Archivist (the only animated Archivist)    |
| `searching` | A lens held to one eye, the ledger closed under the other arm | Sources page header, beside the explanation of discovery       |
| `offline`   | The ledger put away, a small lantern lighting a saved copy    | The offline notice ("showing a saved copy…"), 2×, from 640 px  |
| `lost`      | A raised brow, an open mouth, an open map held up             | Empty results on Skills, Resources and Sources; page not found |

A pose never replaces the explanation: every empty state and notice says what happened and what to do in text.

**Glyphs** (8–11 px wide; 3× in a slot, 2× inline): one per browsing group (Coding, Design, Planning, Communication, Verification,
Project-specific, Other) plus `ledger` (skills, brand), `satchel` (resources, agent toolkits), `shelf` (sources),
and for resource categories `plug` (MCP servers), `hammer` (agent development tools), `book` (agent references) and
`Other` (other developer resources). ES28.3 symbols: `terminal` (an agent, or a CLI tool), `house` (a consumer
project) and `banner` (FM Ecosystem). They are symbols, not characters: no agent portraits, and nothing about them
depends on a status. A new browsing group needs a glyph with the same name; without one, type-checking fails.

**The landing room (ES28.5, the Living Library):** the archive interior drawn in code (`landing/library.tsx`) at
native resolution, two compositions of the same objects: a wide room (384 × 196, 3× at 1152 px) and a two-storey
phone cutaway (168 × 230). Stone wall, wainscot, plank floor, pillars, an arched window, lantern and candle light, and
four working corners: **Tool Workshop** (Resources), **Skill Codex** (Skills), **Source Archive** (Sources) and
**Guild Registry** (FM Ecosystem). Each corner has a **sign**: wooden, hung by chains from the beam or an iron wall
bracket drawn in the art, carrying the catalog's site glyph, the place's name and its live count. The sign is the
destination's real link (HTML text, so it reads in both languages and grows with them); a minimum width keeps it on its
chains. Hover and keyboard focus turn the sign teal, draw selection brackets round the corner and make the Archivist
look towards it with the ledger shining; a tap or Enter simply follows the link. **The large Archivist** is a 32 × 48
rendition of the canonical sprite at the room's own pixel scale (same palette letters; a test checks it never draws
outside the original silhouette). Morning (light) and evening (dark: lanterns lit, stars in the window) are the same
room with a different `--lp-*` palette in `landing.css`. The room's thousands of pixels are merged into a few hundred
paths without changing a pixel, so the landing page is about 800 DOM nodes. The ES28 128 × 80 archive scene was
retired in ES28.5.

**Scaling:** a whole number wherever the size is fixed. The landing room scales with the content column (exactly 3× at
1152 px), with crisp edges; wordmark 3× and 4×; glyphs
3× in slots (ES28.3: at 2× the 8-pixel glyphs were 16 px and hard to tell apart) and 2× inline (list rows, the
header brand, page kickers); Archivist 2× in empty states. Each SVG has fixed width and height (or an aspect ratio), so it never shifts layout.

**Adding art:** sketch the silhouette at native size first; keep one outline rule and light from the top left; use only
existing palette letters (add a token pair to both themes if a new one is truly needed); check it at real size in
both themes; never trace or imitate a commercial game's sprites, fonts, window styles or cursor.

## 8. Motion

- The effective state is `html[data-motion="on" | "off"]`. It is on only when the header setting ("Animation: on/off",
  stored as `localStorage.motion`) is on **and** the device does not ask for reduced motion. With reduced motion the
  setting reads "off", explains why and is `aria-disabled`. The inline script in `index.html` sets the attribute
  before first paint.
- Every decorative animation is keyed to `html[data-motion='on']` (tested). With animation off, every sprite shows its
  resting frame and the site is fully usable.
- Allowed: the Archivist's blink, breathing and ledger glow on the landing page (stepped, slow, and limited: about
  half a minute after the page opens, then it rests on its first frame, so nothing keeps moving while people read);
  the pointer's nudge when keyboard focus arrives (four steps, then still); the button "press" on `:active`; the drop
  shadow colour change on hover. Poses never animate.
- Not allowed: loading sequences, intro animations, gameplay, scroll-triggered reveals, card lifts, parallax, anything
  that moves record-layer text, anything that loops fast.

## 9. Layout and responsive behaviour

- Main column max 72 rem. Header: brand, then the nav from 1280 px (Menu button below), then language, theme,
  animation. On phones the brand name stacks on two lines; below 360 px only the ledger tile shows (the link keeps its
  accessible name).
- Landing (ES28.5): the room is the hero. From 1140 px the headline, description and the three direct actions are
  written on the room's hanging scroll; below that they sit above the room (so the actions are on the first phone
  screen). The phone (under 640 px) gets the two-storey cutaway, never a shrunken room. Under the room: one numbers
  strip (2 × 2 then 4 across), the skill tree (1 then 2 columns), one "What is this website?" record (features, the
  seven separate facts, honest limits), and one band with Gateway and Help & Contact, then the GitHub link.
- Skills: filters window on the left from 1024 px (18.5 rem, so the longest Indonesian option fits its select), a
  Filters disclosure below; cards 1, 2 then 3 across.
- Resources: search and Cards/List on one row, the category selector below 1024 px, then the type and review
  filters with visible labels, side by side from 640 px and full width below. No select ever cuts off its chosen
  option at 320–1280 px in either language (measured by the browser review).
- Overview: Registry window across the top (4 tiles: 1, 2 then 4 across), then two columns of windows from 1024 px.
- Consumers: an index of build links (`/consumers#consumer-<id>`), then build cards 1 then 2 across.
- Reserve the height of catalog-driven content while it loads (stats, counts, `main` minimum height), so nothing jumps
  when the catalog arrives. Measured cumulative layout shift on cold load: at most 0.006.

## 10. Accessibility checklist (every converted page)

- One `h1`, no skipped heading levels, landmarks unchanged.
- Text contrast at least 4.5:1 (3:1 for large text) in both themes, measured against the real background.
- Every Tab stop shows focus: the 2 px ring, the card ring or the pointer.
- Every SVG in the world layer is `aria-hidden` and not focusable; no fact lives only in art.
- Touch targets at least 24 × 24 px everywhere, and 40 px or more for the primary phone controls (header tools,
  language, Cards/List, filters, category selector, clear-filter buttons, decision chips); the Menu and Filters
  disclosures work by tap.
- Long repository names, URLs and Indonesian labels wrap inside their panel (badges may wrap when one alone is wider
  than its row), so nothing scrolls sideways at 320 px.
- No horizontal scrolling at 320, 375, 768 and 1280 px, in English and Indonesian.
- Works with animation off and with reduced motion; works offline from the cached shell.

## 11. Page conversions

Converted in ES28: the global shell (header, navigation, footer, skip link, offline notice), shared primitives
(`PageHeader`, `Badge`, `Empty`, `Window`, controls, buttons, toggles, highlight), the landing page and the Skills page.
Converted in ES28.2: Resources (inventory), Sources (archive), skill detail (ability record), resource detail (equipment
record) and their sub-sections (content availability, audit, distribution, upstream, evaluation, ecosystem
integration).

Converted in ES28.3, each with a kicker above the unchanged title:

| Page           | Kicker                 | Treatment                                                                                                                                                                                                                                                                     |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview       | Adventurer's dashboard | Titled windows: Registry tiles (skills, resources, sources, consumers), skills by origin, the four third-party review counts (separate facts, never a bar), agent evidence per agent, recent evidence, private skills. Every count from the catalog                           |
| Consumers      | Agent builds           | One build card per project: kind, agents used with, then "Assigned skills · desired state", one row per assignment (category glyph, agents, install mode, verification, curated release or legacy), evidence lines, verification notes; shared sources and the status command |
| Agents & tools | Agent roster           | One roster panel per tested agent with the four recorded counts, the glossary and platform limits, then one card per tool with its type symbol, links and the skills that require it as chips                                                                                 |
| FM Ecosystem   | Guild registry         | The notice "Public to read does not mean public to install" first, then one record per skill with the skill folder in this repository and each shared source repository (private ones named, not linked)                                                                      |

Rules that still apply to any new page:

1. Use tokens (`text-(--cw-muted)`, `bg-(--cw-sunken)`, `signal-*`) and the components above, never `zinc-*`,
   `indigo-*` or `rounded-*`.
2. Cards are `.cw-item` or `.surface` panels with a `GlyphSlot` and a `.cw-record` strip; tabular lists are `Ledger`
   tables.
3. Detail pages keep their order (see ES28.2 above). Repository links stay visible text links (`UrlText`) with the
   external icon, never inside collapsed UI.
4. Run `pnpm check` and the browser review: `apps/web/scripts/browser-review.mjs` (opt-in; see its header) covers
   every page at widths 320–1280, both themes and languages, keyboard, touch, reduced motion, animation persistence,
   one-click source links, MCP endpoints, layout shift, offline deep links, dropdown truncation, the List views'
   accessibility tree and consumer anchors, and writes screenshots.
