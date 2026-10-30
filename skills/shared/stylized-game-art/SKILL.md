---
name: stylized-game-art
description: Art direction and production workflow for original stylized game art — characters, props and rooms in pixel art, low-poly/stylized 3D or other styles, including one character interpreted across several visual styles. Use when designing or revising game characters or environments, creating pixel sprites or 3D models for a web game, mapping one avatar configuration to several art styles, or reviewing whether game art is good enough to ship.
---

# Stylized Game Art

Produce deliberately designed, original game art, not shapes that merely work. The test is always the same: at the size
players actually see it, does the character read instantly, feel like one coherent world, and stay recognisable across
every style the game supports?

Work in this order. Do not start producing assets before steps 1–3 exist in writing.

## 1. Write the art bible first

Create (or update) a short art-direction document in the project (for example `docs/art-direction.md`). Use
`references/art-bible-template.md`. It must fix, before any asset is made:

- **Pillars:** three adjectives the style must hit and two it must avoid.
- **Palette:** named ramps (3–5 tones each) with hue-shifted shadows and highlights; a small fixed set of accent colours.
- **Shape language:** which primitives dominate (round, boxy, tapered), and how big the head is relative to the body.
- **Proportion sheet:** for each character, head-to-body ratio, eye placement, limb length, at a stated unit
  (pixels at native resolution, or metres in 3D). Front, side and back descriptions.
- **Gameplay size:** the on-screen height of a character during play (for example "48 px tall at 3× on desktop"). All
  detail decisions follow from this number; detail smaller than one on-screen pixel or one shading step is wasted.
- **Animation list:** states, directions, frame counts and timings (see section 4).
- **Originality:** name the references for mood only, and what must not be copied from them.

## 2. Separate identity from presentation

When a game offers several visual styles, the player's character is one identity rendered many ways.

- Keep one **canonical configuration** (species, colours, outfit, accessory, expression) with stable ids. Never store a
  second identity per style.
- Each style has an **asset map**: canonical id → style asset, with an explicit fallback and a recorded reason when a
  style lacks an asset (for example `hair:curly → pixel:short (no curly sprite yet)`). Fallbacks are visible in a review
  page, never silent.
- Colours map through **palette ramps**, not blind tinting: pick or generate a 3–5 tone ramp per canonical colour so the
  sprite keeps its value structure. Never multiply a finished sprite by a flat colour.
- World logic (positions, walkable grid, interaction points) stays style-independent; each renderer owns an explicit
  coordinate transform (for example grid cell → isometric world, grid cell → top-down pixel tile). Never reuse 3D
  coordinates as screen coordinates.

See `references/multi-style-mapping.md`.

## 3. Choose the production method honestly

| Need | Prefer | Avoid |
| --- | --- | --- |
| Pixel art | Hand-authored sprites at one native resolution (character, tiles, props), palette-indexed, nearest-neighbour integer scaling | Pixelating or downscaling a 3D render; mixed pixel densities; smoothing filters |
| Stylized 3D | Artist-authored or script-sculpted meshes exported as optimised glTF/GLB, few materials, baked vertex colours or small textures | Characters assembled from dozens of unrelated primitives; one material per primitive |
| Props / furniture | A small kit of reusable shapes in the style's shape language, merged per material | Unique one-off geometry or sprites for every variant |

If the available tools cannot reach the quality the art bible asks for, say so and label the result a prototype. Never
call a placeholder "final" or "polished".

Workflows: `references/pixel-art-workflow.md`, `references/stylized-3d-workflow.md`.

## 4. Animate for readability

- Every character shares one animation state machine (idle, walk, sit, task-specific states) across styles; styles only
  change how a state is drawn.
- Pixel art: few, strong frames (idle 2, walk 2–4 per direction, task 2) beat many weak ones; directions follow the
  camera (top-down three-quarter needs down/up/side, side mirrored).
- 3D: procedural or keyframed motion on a shared rig; secondary motion (blink, ear flick, breathing) sells life cheaply.
- Respect reduced-motion settings: remove ambient motion, keep state-communicating motion (walking) readable.

## 5. Review at real size, every time

Before claiming art is done, look at it in the running game at gameplay size on desktop and mobile, in every lighting
or theme variant, beside the other styles. Use `references/visual-review-checklist.md` and keep screenshots as evidence.
Automated tests prove the art loads, not that it looks good.

## 6. Performance budgets

State budgets in the art bible and measure them in the running app (draw calls, triangles, texture memory, sprite atlas
size, frame time). Distinguish real-device measurements from headless or software-rendered ones. Load only the renderer
and assets for the active style.

## 7. Licensing and attribution

- Original work is the default. Third-party assets need a recorded licence that allows the use, with attribution kept in
  the project (for example `docs/asset-licenses.md`): source URL, author, licence, date, modifications.
- Never include assets traced, ripped or closely imitated from commercial games. "Inspired by the mood of" is fine;
  recognisable characters, layouts, palettes-as-trade-dress and sprites are not.
- Generated or script-built assets: record the generator (script path, parameters) so they can be rebuilt.
