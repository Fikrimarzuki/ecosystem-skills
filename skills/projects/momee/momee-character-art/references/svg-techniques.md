# SVG techniques

## File rules

These are checked by `scripts/check-svg.mjs`:
- A `viewBox` with integer canvas dimensions. Mom head sources use 780×880.
- Every shape and group has a unique, descriptive `id`, such as `eye-left-iris` or `hair-back-wave-2`.
- No `<image>`, `<text>`, `<script>` or `<foreignObject>`, and no external `href`s. Everything must be editable vectors.
- No `<filter>` by default. Blur filters render differently in Inkscape, browsers and Phaser exports, and they cost performance. Fake softness with gradients that fade to 0 opacity. If a filter is ever truly needed, record why in the review notes.
- Gradients live in `<defs>` with ids prefixed `grad-` (`grad-skin`, `grad-hair-base`, `grad-iris`), so recolouring means editing the stops.
- Gradient ids must not reuse a shape's id. `projects/momee/styles/soft-storybook-adventure/characters/mom/source/mom-head-v1.svg` (`neck`, `blush`) and the M1.1c eye (`iris`) both collide, and work only because the browser happens to use the first match.

## Organic Bézier paths

- Use cubic Béziers (`C`). Keep the control handles of neighbouring segments collinear at smooth points, and break them only where a real corner exists, such as a hair tip or a lash flick.
- **Hand-place the anchors.** A path with 6–12 anchors that you reasoned about beats a 60-point generated curve. When drafting from points, a Catmull-Rom-to-Bézier helper exists in `projects/momee/styles/soft-storybook-adventure/characters/mom/source/construction/build_mom_head.py`. It is a drafting aid only, and its output still needs manual asymmetry.
- **Tapered shapes:** lashes, brows, strands and creases should be closed filled paths, wide in the middle and pointed at the ends (an offset of a spine with sin-shaped width). Avoid uniform-width strokes for features.
- **Avoid primitives for visible features:** `<circle>`, `<ellipse>` and `<rect>` read as stickers. They are fine for hidden helpers, clip masks, an iris clipped by the lids, or soft gradient blobs whose edge fades to 0.
- **Asymmetry:** after mirroring a feature, nudge the copy (a few units of position, rotation or curvature). Faces, hair and poses are never perfectly symmetric.

## Depth without texture

- **Layer per area:** base gradient fill, then a soft shadow shape (same hue, darker, opacity 0.2–0.4, gradient edge), then a highlight shape.
- **Clipping:** use `clipPath` with the area's own outline to keep shading inside it, for example eye contents inside the opening, or hair shading inside a clump.
- **Fading gradients:** a `radialGradient` with `stop-opacity` going to 0 gives a soft edge. Check the rendered result; a visible elliptical edge means the radius or opacity is wrong (the M1.1c lid-shade blob).

## Rendering and export

- **Reference renderer:** Inkscape, via `scripts/export-png.sh`. The script uses `$INKSCAPE`, else `inkscape` on `PATH`, else the macOS app bundle (`/Applications/Inkscape.app/Contents/MacOS/inkscape`). Its `--version` has hung before, so always run it with a timeout.
- **Resolution:** export at 192 dpi (2× the viewBox) for review. Check that the output has transparency when it should.
- **Browser check:** if web rendering matters, Chromium rendering is available through `scripts/lib/render.mjs` (`renderSvg`) in the `ecosystem-assets` repository.
- **Validation:** `xmllint --noout file.svg` checks the XML; `scripts/check-svg.mjs` checks structure.
