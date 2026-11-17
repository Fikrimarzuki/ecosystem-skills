# RPG visual redesign: skill selection and design discovery

Date: 2026-11-16. Status: **discovery only.** Nothing in `apps/web` was changed, nothing was installed, approved,
assigned, linked, committed or deployed. Implementation waits for the owner to choose a concept.

## 1. Brief, as understood

- **Subject:** a personal, security-first registry of AI-agent skills and developer resources (264 skills, 17
  resources, 76 sources, 20 consumers, 28 evidence records at the time of writing).
- **Audience:** the owner, and developers deciding whether a skill or resource is safe and useful to adopt.
- **Primary job:** find a skill or resource and judge its provenance and review state quickly. The RPG layer has to
  make the site memorable without slowing that job down.

Please confirm or correct this before a concept is chosen.

## 2. Skills inspected

"Installed" means a copy exists under `external/skills/` (recorded in `external/installed.json`). "Linked here" means
the skill is linked into this repository's `.claude/skills` and `.agents/skills`, so an agent working here discovers
it on its own. Assignment is from `registry/consumers.json` (consumer `ecosystem-skills`).

| Skill                            | Registry review                                                  | Installed                | Linked here / assigned                                        | Read in this pass                                                          |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `frontend-design`                | Approved (ES6 pilot), `dbd4588`, Apache-2.0                      | Yes, hash matches pin    | **No / no**                                                   | Yes: full `SKILL.md`, read as a file                                       |
| `writing-plans`                  | Approved (ES6 pilot), `2ce8aa1`, MIT                             | Yes                      | **No / no**                                                   | Yes: the opening sections                                                  |
| `verification-before-completion` | Approved (ES6 pilot), `2ce8aa1`, MIT                             | Yes                      | Yes / yes (assignment unverified: natural trigger unreliable) | Yes: the opening sections                                                  |
| `threejs-react-three-fiber`      | Approved 2026-11-09 for the Xpenz onboarding, `0e18186`, MIT     | Yes                      | **No / no**                                                   | Yes: the opening section and the review record                             |
| `antislop-ui`                    | Reviewed (ES27), recommendation **reference-only**, not approved | No, no local review copy | No / no                                                       | **No.** Only the ES27 audit record. Reading it needs a download (see §2.3) |

Found while inspecting, and relevant:

| Skill                             | Status                                                                             | Why it matters                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `stylized-game-art` (first-party) | `skills/shared/stylized-game-art`, registry review `unreviewed`, not assigned here | Pixel-art production rules: art bible first, palette ramps, indexed sprites, integer scaling, real-size review, licences |
| `web-quality-accessibility` 1.0.1 | Curated in `library/`, ES23 review "no blocking issues", **release not approved**  | WCAG checks for the redesign; already pinned, curated and reviewed                                                       |

### 2.1 How each one contributes

- **`frontend-design`: primary design authority.** Its process is used here: a short token plan (4–6 named colours,
  type roles, layout in ASCII, principles), a review of that plan against the brief, then building and critique. It
  also supplies the list of generic tells to avoid and the rule to spend boldness in one place, with one
  orchestrated motion moment instead of scattered effects.
- **`stylized-game-art`: art authority under `frontend-design`.** It governs the sprites only: write the art bible
  before any asset, use palette-indexed grids with 3–5 tone ramps, integer scaling with no smoothing, few strong
  frames, reduced motion, review at real size in both themes, and a licence record for every non-original asset.
- **`writing-plans`: after a concept is approved.** It turns the chosen concept into a task-by-task implementation
  plan with exact files and tests.
- **`verification-before-completion`: during implementation.** It is the gate before any "done" claim: `pnpm check`
  and the browser matrix from [website.md](website.md#checking-the-site) (320/375/768/1280 px × both themes ×
  both languages), plus reduced motion, animation off and offline.
- **`threejs-react-three-fiber`: not recommended for this work.** None of the concepts needs 3D. three.js plus
  fiber would be the largest dependency on a site that currently ships only React. Its own review notes that drei
  fetches a Draco decoder and HDR presets from CDNs, which conflicts with offline PWA behaviour. Keep it for a later
  3D diorama only if one is ever wanted.
- **`antislop-ui`: manual audit list after the build, not a design source.** ES27 recommends using its App &
  Dashboard, Performance and Web Baseline sections as a checklist only.

### 2.2 Overlaps and conflicts

| Conflict                                                                                                       | Resolution proposed                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `antislop-ui` caps the palette at 2–3 core colours + 1 accent; `frontend-design` asks for 4–6 named hex values | `frontend-design` wins. The concepts below use 5–6 tokens per theme, with status colours kept separate |
| `antislop-ui` treats default icon sets as a tell                                                               | Moot: every concept replaces UI icons with original pixel glyphs                                       |
| `writing-plans` saves to `docs/superpowers/plans/` and says "frequent commits"                                 | Plan goes in `docs/` next to this file; no commit steps (the owner commits)                            |
| `writing-plans` header requires `superpowers:subagent-driven-development` / `executing-plans`                  | Not registered or approved. Drop that line from the plan header                                        |
| `stylized-game-art` "pixel-art workflow" draws scenes to a canvas                                              | Use inline SVG instead (themeable, accessible to hide, no canvas code); its other rules still apply    |
| `frontend-design` "motion sparingly" vs the brief's "animated pixel sprites"                                   | One orchestrated hero moment plus an idle blink; everything else static. Animation can be switched off |
| `threejs-react-three-fiber` CDN fetches vs offline PWA                                                         | Not used                                                                                               |

### 2.3 Recommendations that need owner decisions

Nothing below has been done.

1. **Make `frontend-design` and `stylized-game-art` discoverable in this repository** by assigning them to the
   `ecosystem-skills` consumer and running `pnpm skills:sync ecosystem-skills` (project-local symlinks only, no
   global change). `writing-plans` can be added in the same step for the planning phase. Without this, agents here
   only see them if told to read the files.
2. **Read `stylized-game-art` before it is relied on.** It is first-party, so no third-party security review
   applies, but the registry records it as unreviewed. It is 86 lines plus five short references.
3. **Approve `web-quality-accessibility` 1.0.1 for this work, or decline it.** It is the only already-curated
   accessibility skill. The ES23 review found no blocking issues; approval of the release is still open.
4. **`antislop-ui`:** to read it, `pnpm skills:review antislop-ui` downloads it at its pin into `external/.review/`.
   This is a network download, so it was not run. It stays reference-only either way.
5. **No new third-party skills are recommended.** Unreviewed design and motion candidates (`lottie-motion-design`,
   `landing-page-design`, `design-dna`, the GSAP library entries) add nothing that CSS `steps()` animation and the
   two skills above do not already cover.

## 3. Rules every concept shares

These hold no matter which concept is chosen. They are what keeps the catalog honest.

### 3.1 Two layers

- **World layer:** the hero, sprites, scenery, frames, tree artwork. It is decorative: `aria-hidden`, never the
  only place information appears, removable without losing anything, static when animation is off.
- **Record layer:** repository, source URL, pinned revision, licence, provenance, review and approval status,
  security audit, installation and assignment status, MCP and resource type. It is always set in the body face at
  full contrast, never in the pixel face, never inside the artwork, never animated, and it looks the same in every
  concept.

### 3.2 Security status is never a game mechanic

- Status stays a chip with an icon and the existing words (Candidate · discovered, Reviewed, Approved, Rejected,
  Review incomplete). All statuses use one chip shape.
- **Not allowed:** rarity colours or frames by status (grey/green/blue/purple/gold tiers), stars, levels, XP or
  progress bars, "unlocked" or "locked" wording for approval, achievement toasts, glow or shine on Approved, the
  hero reacting to a status, sparkle on Verified.
- Every card uses the same frame. Only the category glyph differs, and category is a browsing group, not a rank.
- Evidence stays a count with its method. Nothing fills up.
- The lifecycle stays seven separate facts in a list, never a path to walk or a bar to fill.

### 3.3 The skill tree is a map of categories

Root (the registry) → the six browsing groups → registry categories, each with its count (Coding 123, Design 70,
Verification 35, Planning 28, Communication 7, Project-specific 1). Every node is a link to the filtered Skills page
(`/skills?group=Design`). It has no locks, no prerequisites and no progression; a node is dim only when it is empty.

### 3.4 The hero

An original character, a guide and not a scoreboard. Poses: idle, reading (landing), searching (no results),
camping (offline copy notice), lost (page not found). It does not appear on skill or resource detail pages, which
stay source-first. Native size 16×24 px, shown at 2× or 4× only.

### 3.5 Implementation approach (for estimating; nothing built)

- **Sprites** are palette-indexed text grids in TypeScript (`apps/web/src/sprites/`), rendered as inline SVG with
  `shape-rendering="crispEdges"`. Each palette index is a CSS variable, so the light and dark themes swap ramps
  without a second set of art. Frames switch with CSS `steps()`. No canvas, no WebGL, no new runtime dependency.
- **Frames** for windows and cards use `border-image` from one small SVG per theme.
- **Animation off:** `prefers-reduced-motion` stops everything; a new header setting ("Animation: on/off", stored
  in `localStorage` like language and theme) does the same for people who want it off without changing the
  system. The catalog is fully usable with it off.
- **Fonts** are self-hosted WOFF2 (SIL OFL), Latin and Latin Extended subsets, precached by `sw.js` so offline
  keeps the type. No Google Fonts requests from the site. Licences recorded in `docs/asset-licenses.md`.
- **Budgets:** all sprite and frame art under 20 KB; fonts under 150 KB total; at most one animation running at a
  time.
- **Search highlighting** stays `<mark>`, restyled. Cards/List toggles, URL filters, keyboard paths, skip link and
  Menu button behaviour are unchanged.
- **Tests to add:** the world layer is `aria-hidden`; every card renders the same frame class whatever its status;
  animation-off renders static frames; new strings have Indonesian entries (the existing completeness test enforces
  this).

## 4. Concepts

### Concept A: Command Window (recommended)

**Thesis.** The site is the pause menu of an archivist's journey. Everything sits in a window. The keyboard focus is
a pixel pointer that sits beside whatever has focus, so keyboard users get the most visible focus on the site.

**Landing page.**

```
┌ Overview Skills Resources Sources FM Ecosystem Consumers Agents & tools   EN|ID  ☾  ▶anim ┐
┌──────────────────────────────────────┐ ┌───────────────────┐
│ Ecosystem Skills          (pixel)    │ │   [ Archivist ]   │
│ One place to manage the skills       │ │   at a lectern,   │
│ your AI agents use                   │ │   turning a page  │
│ [Browse skills] [See the overview]   │ ├───────────────────┤
│ [Get in touch]                       │ │ 264 skills, 10    │
└──────────────────────────────────────┘ │ approved at a pin │
                                          └───────────────────┘
┌ Skill tree ──────────────────────────────────────────────────┐
│ Registry ─┬─ Coding 123 ─┬─ Design 70 ─┬─ Verification 35    │
│           └─ Planning 28 ┴─ Communication 7 ┴─ Project 1     │
└──────────────────────────────────────────────────────────────┘
┌ Lifecycle: seven separate facts ─┐ ┌ Archives: 76 sources ─────┐
└──────────────────────────────────┘ └───────────────────────────┘
┌ Explore more projects (Gateway) ──────────────────────────────┐
```

**Hero: the Archivist.** A short figure in a soft cap and scarf, carrying a thick ledger. Role: the keeper of the
records, which fits a registry whose point is provenance. Marigold scarf is the only accent in the art.

**Skills page.** A Filters window on the left (search, category, source, review status, evidence, content), results
on the right. Cards view is an inventory grid; List view is ledger rows. Below 1024 px Filters becomes a disclosure
button above the results.

**Resource cards (inventory).** One frame for every item. Top row: category glyph in a 16 px slot, then the name.
Then two lines of description. Then the record strip, always visible: repository (owner/name, linked), pinned
revision (7 characters, full value on the detail page), licence, status chip. Resources use type glyphs (MCP
server: plug; toolkit: pouch; reference: book; developer tool: wrench) with the type written out beside the glyph.

**Sources (archives).** Each source is a shelf card: publisher, repository, pinned commit, licence, skills found
versus registered, decision chip, warnings count with text.

**Typography.** Display: Pixelify Sans 600, headings 20 px and up only. Body and UI: Atkinson Hyperlegible Next.
Data (revisions, hashes, commands): Atkinson Hyperlegible Mono. Scale 14 / 16 / 20 / 25 / 32 / 40.

**Palette.**

| Token    | Light     | Dark      | Use                                |
| -------- | --------- | --------- | ---------------------------------- |
| Page     | `#E4E8F0` | `#0F1320` | Background, faint dither pattern   |
| Window   | `#F8F9FC` | `#1A2030` | Opaque surfaces                    |
| Ink      | `#1F2638` | `#E8ECF5` | Text and the dark bevel            |
| Bevel    | `#FFFFFF` | `#3B4663` | Window highlight edge              |
| Signal   | `#0E7782` | `#5CC8D1` | Links and actions (4.6:1 / 8.3:1)  |
| Marigold | `#F0A202` | `#FFC433` | Focus pointer and hero accent only |

Marigold on the light window is only 2.0:1, so the pointer always carries its ink outline and the existing 2 px
focus ring stays.

**Sprites and icons.** Hero 16×24 at 4× on the landing, 2× in empty states. Category glyphs 12×12 at 2×: Coding a
bracket scroll, Design a brush, Planning a folded map, Communication a speech scroll, Verification a lens,
Project-specific a banner, Other a crate. One dark ink outline rule, light from the top left.

**Animation.** One moment: on landing load the Archivist turns a ledger page (4 frames, 600 ms), then idles with a
blink every few seconds. The focus pointer nudges 1 px (2 frames). The mobile Menu opens with a stepped 120 ms
reveal. Cards do not lift on hover; the frame's inner edge changes colour instead.

**Mobile.** The hero window shrinks to a 2× portrait beside the title. The skill tree becomes a vertical list with
counts. Filters become a disclosure. Cards go to one column; List rows stack into labelled lines as today.

**Readability and performance.** Opaque windows replace today's translucent glass, so contrast no longer depends on
the background. Smallest art budget of the three. No new dependency. Risk: generic JRPG menu trade dress. Avoid blue
gradient windows, white double borders and any specific franchise's cursor, font or sounds. The windows here are
flat slate with a bevel.

### Concept B: Skill Atlas

**Thesis.** The registry is a hand-surveyed chart. Browsing groups are regions, categories are settlements, and the
hero is a cartographer surveying them.

**Landing page.**

```
┌ header ─────────────────────────────────────────────────────────┐
│ [Cartographer on a hill]   Registry ══╦══ Coding (123) ── react… │
│  with spyglass                         ╠══ Design (70)  ── video… │
│                                        ╠══ Verification (35)     │
│ Ecosystem Skills                       ╠══ Planning (28)          │
│ [Browse skills] [See the overview]     ╚══ Communication · Project│
├ Legend: lifecycle, seven separate facts ┬ Survey stations: 76 ──┤
```

**Hero: the Cartographer.** Wide-brim hat, spyglass, map tube on the back. Role: surveyor of where skills come from.

**Skills page.** The atlas shrinks to a left rail; choosing a region sets the category filter. Cards are survey
notes; List view is a gazetteer table.

**Resource cards.** "Supply depot": resources as provision crates, with the same record strip as Concept A.

**Sources.** Survey stations along the edge of the chart, each with its pinned commit and licence.

**Typography.** Display: Workbench (pixel-grid variable face). Body: Literata, with extra line height for serif
text. Data: IBM Plex Mono.

**Palette.**

| Token     | Light     | Dark      | Use                         |
| --------- | --------- | --------- | --------------------------- |
| Chart     | `#E3EDE6` | `#0E1828` | Background                  |
| Sheet     | `#F6FAF7` | `#16223A` | Surfaces                    |
| Ink       | `#15302A` | `#EDE6CF` | Text                        |
| Verdigris | `#23806F` | `#5BC0AE` | Links, roads                |
| Ochre     | `#9A7316` | `#E3B451` | Region markers, hero accent |

**Animation.** One moment: when a region is hovered or focused, a dashed pixel path draws from the root to it. The
spyglass glints at idle.

**Mobile.** The chart becomes a vertical trail with the root at the top. This loses most of the atlas effect.

**Readability and performance.** The atlas has to place 25 categories with very uneven counts (123 versus 1) and
longer Indonesian labels without collisions, at every width: the hardest layout of the three. A map also implies
that position means something, so it needs a visible note that regions are browsing groups.

### Concept C: Night Market Guild

**Thesis.** Skills are traded at a night market of guild stalls. Each source is a stall with its banner and ledger;
the hero is a courier with a rattan pack. It draws on the owner's Indonesian context and the bilingual site.

**Landing page.**

```
┌ header ─────────────────────────────────────────────────────────┐
│ ≈≈ lanterns ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈  │
│ [stall][stall][Registry stall][stall][stall]   ← courier walks in│
├─────────────────────────────────────────────────────────────────┤
│ Ecosystem Skills — headline, copy, CTAs (outside the scene)     │
│ Skill tree as a string of lanterns between group stalls         │
```

**Hero: the Courier.** Headscarf, woven rattan backpack, small lantern. Role: carries skills from the stalls
(sources) to projects (consumers).

**Skills page.** Inventory is the rattan pack: a woven-pattern frame around the grid. List view is the market
ledger.

**Resource cards.** Goods on a stall shelf, same record strip.

**Sources.** The strongest fit of any concept: every source is literally a stall with its owner's banner.

**Typography.** Display: Jersey 10 (sign-painter pixel). Body: Plus Jakarta Sans. Data: JetBrains Mono.

**Palette (dark first).**

| Token   | Dark      | Light     | Use                |
| ------- | --------- | --------- | ------------------ |
| Night   | `#0F2A2E` | `#E5F0EF` | Background         |
| Stall   | `#173A3F` | `#F7FBFA` | Surfaces           |
| Paper   | `#F4EFE4` | `#162629` | Text               |
| Lantern | `#F2A541` | `#1D6A72` | Accent (art, CTAs) |
| Leaf    | `#6BA352` | `#3F7A35` | Secondary art      |
| Rattan  | `#CDA675` | `#8A5F2E` | Frames             |

**Animation.** The courier walks in once (4-frame walk, 1.2 s) and lanterns flicker. This is the most ambient motion
of the three, and all of it stops when animation is off.

**Mobile.** The panorama crops to the Registry stall. The scene layer clips, so it never causes sideways scrolling.

**Readability and performance.** The highest art cost: at least eight stall sprites, background tiles and a walk
cycle. Amber lanterns sit close to the amber warning status, so the art palette has to stay clear of status colours.
Cultural motifs need the owner's review so they read as respectful and not as decoration.

## 5. Comparison and recommendation

| Criterion                 | A: Command Window                           | B: Skill Atlas                       | C: Night Market Guild                  |
| ------------------------- | ------------------------------------------- | ------------------------------------ | -------------------------------------- |
| Visual distinctiveness    | Medium-high                                 | High                                 | Highest                                |
| User flow                 | Unchanged; windows map onto existing panels | Adds a map layer to navigation       | Scene sits above content; extra scroll |
| Accessibility             | Best: pointer improves focus visibility     | Good; map needs a text equivalent    | Good; busy scene behind the hero       |
| Implementation complexity | Low: CSS frames, one hero, glyph set        | Medium-high: responsive tree layout  | High: scene art and walk cycle         |
| Maintenance               | Low: new categories need one glyph          | Medium: the layout changes with data | High: new sources need stall art       |
| Security honesty risk     | Low                                         | Low                                  | Medium: lantern amber vs warning amber |

**Recommendation: Concept A, Command Window.** It changes how the site looks, not how people use it. Every existing
panel becomes a window, so search, filters, Cards/List, highlighting and the source-first detail pages keep their
structure and their tests. Its RPG element, the focus pointer, also improves accessibility instead of competing with
it. Its art budget is one hero and about a dozen glyphs, which one person can maintain. One element worth borrowing
from C if wanted: Plus Jakarta Sans as the body face, as a nod to the Indonesian side of the site.

The redesign would also remove generic tells in today's site: the gradient headline, the arrow appended to the main
button, the uppercase "A real entry from the registry" label and the glass panels.

## 6. Optional first-party skill: is a reusable RPG UI skill justified?

**Not yet.** `frontend-design` covers the design method and `stylized-game-art` covers sprite production. The only
gap is a set of rules for putting game UI on top of a data product: the two-layer rule, status never shown as a
game mechanic, palette-indexed SVG sprites themed by CSS variables, frames, the focus pointer and the
animation-off contract. That is better extracted after one real implementation, from code that has passed review.

Two options once Concept A is built and reviewed:

1. **Smaller (preferred):** add `references/game-ui-for-apps.md` to `stylized-game-art`.
2. **Separate skill**, if a second project (for example Playnest) wants the same treatment:

```
skills/shared/game-ui-for-data-products/
  SKILL.md                      when to use; the two-layer rule; precedence under frontend-design
  references/status-honesty.md  what may and may not be gamified, with examples
  references/sprite-pipeline.md indexed grids → themed inline SVG, frames, steps() animation
  references/frames.md          border-image windows and cards, focus pointer
  references/review-checklist.md animation off, reduced motion, contrast, i18n overflow, offline
```

Neither is created.

## 7. Decisions needed

1. Which concept (A recommended), and whether to borrow anything from the others.
2. The hero's name and look (sketches are prototypes, not final art).
3. Whether to assign `frontend-design`, `stylized-game-art` and `writing-plans` to this repository (§2.3 item 1).
4. Whether to approve `web-quality-accessibility` 1.0.1 for this work.
5. Whether to add the "Animation: on/off" setting and self-hosted fonts (both new to the site).
