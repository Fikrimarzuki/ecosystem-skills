# Landing prototypes (ES28.4) and the decision (ES28.5)

Two interactive pixel-art landing pages were built in ES28.4 for the owner's visual decision. **In ES28.5 the owner
chose Concept A, Living Library: it is now the production landing page** (`apps/web/src/pages/Home.tsx` with
`apps/web/src/landing/`; see `docs/command-window-design.md`, "The landing room"). The ES28.4 prototype files were
promoted unchanged and then refined: destination signs (borrowed from Concept B's signposts) replaced the floor
plates, the floor was trimmed, the guild banner shortened, and the phone composition tidied.

Concept B, Archive Overworld, was not selected. It stays as an isolated development reference:

| Path                             | What                                                                     |
| -------------------------------- | ------------------------------------------------------------------------ |
| `/_prototypes/archive-overworld` | Concept B: the top-down map, with the same signs, counts and links       |
| `/_prototypes`                   | Index: links to the landing page (Concept A) and the Concept B reference |

The ES28.4 review gallery (both concepts, interaction states, offline) and the ES28.5 gallery are the comparison
evidence.

## How to preview

- **Development:** `pnpm dev`, then open the paths above (the prototypes are always available under `vite`).
- **Production-like (PWA, offline):** build with the flag into a directory outside `dist/` and preview it:

  ```sh
  VITE_LANDING_PROTOTYPES=1 pnpm --filter @ecosystem-skills/web exec vite build --outDir /tmp/es-proto --emptyOutDir
  pnpm --filter @ecosystem-skills/web exec vite preview --outDir /tmp/es-proto --port 4321 --strictPort
  ```

- **Browser review (opt-in):** `apps/web/scripts/prototype-review.mjs` (see its header) checks both prototypes at
  320–1280 px, both themes and languages, in Chromium and WebKit (since ES28.5, Concept B only; the landing page is
  checked by `browser-review.mjs`): overflow, headings, contrast, hidden art, target
  sizes, keyboard and touch navigation, reduced motion, the Animation setting, frame pacing, layout shift, remote
  requests and offline rendering.

## Isolation

- `App.tsx` reaches the Concept B reference only through a lazy import behind a build-time constant
  (`import.meta.env.DEV || import.meta.env.VITE_LANDING_PROTOTYPES === '1'`). In the normal build that constant is
  `false`, so the chunk is never emitted: the published bundle, the navigation, `sw.js` and every public export carry
  no prototype code (checked on every build in ES28.5). The Living Library itself is ordinary production code.
- Concept B's map colours live in `src/prototypes/prototypes.css`; `index.css` excludes `src/prototypes` from
  Tailwind's scan. Its Indonesian strings live in `src/prototypes/strings.ts`, not in `locales/id.ts`.
- `src/prototypes/prototypes.test.tsx` checks Concept B and its translations; `src/es285.test.tsx` checks the landing
  page and that nothing outside `App.tsx` refers to the prototypes.

## Rules both prototypes keep

- The scene is decorative (`aria-hidden`); every destination is a real link laid over the art, with a visible plate
  naming the place and its live count, and an accessible name saying where it goes. Tap, click, Enter or Space all
  follow the link; nothing depends on hover or animation.
- The three direct actions (Browse skills, Explore resources, View sources) are always ordinary buttons.
- No security or approval state appears in the art. Nothing is locked, unlocked, levelled, equipped or rewarded.
- Morning (light) and evening (dark) are the same world with a different palette; teal marks the chosen place; gold
  is only lamp light and decoration.
- Motion follows the site's Animation setting and reduced motion; every loop is stepped and stops after about half
  a minute.
- The large Archivist in Concept A is a 32 × 48 rendition of the canonical 16 × 24 sprite (same palette letters; a
  test checks it never draws outside the original silhouette). Concept B uses the canonical sprite itself.

## Removing the reference

If Concept B is no longer useful: delete `src/prototypes`, the `LANDING_PROTOTYPES` block and its branch in
`App.tsx`, the `@source not './prototypes'` line in `index.css`, `apps/web/scripts/prototype-review.mjs`, and the
prototype part of `src/es285.test.tsx`. The landing page does not depend on any of them.
