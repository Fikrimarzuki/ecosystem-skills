---
name: momee-character-art
description: Draw, revise or review Momee character artwork (Mom, Dad, Boy, Girl) as editable, animation-aware SVG in the Soft Storybook Adventure style (target Candidate B). Use for faces, eyes, hair, shading, part layering, Inkscape export and side-by-side visual review of character SVGs in ecosystem-assets/projects/momee. Not for rigging, Phaser code or raster painting.
---

# Momee character art

Paths below are relative to the `ecosystem-assets` repository root. Skill files are relative to this folder.
Work from inside `ecosystem-assets`: the scripts take paths relative to the current directory, and `compare-sheet.mjs` finds the repository's Chromium helper from there (or from `ECOSYSTEM_ASSETS_ROOT`). This skill's folder may live outside that repository, so `<skill>` means this folder as you loaded it.

## Target

**Soft Storybook Adventure, Candidate B: Simplified Soft Storybook.** Use selectively stronger outlines where they help readability.
- **Reference sheet:** `projects/momee/styles/soft-storybook-adventure/references/mom-art-direction-exploration-v1.png`, middle column.
- **Identity source:** `…/references/momee-soft-storybook-master-reference-v1.png`, described in `…/docs/mom-visual-spec-v1.md`.

Quality comes first. Animation-ready structure must never be an excuse for a flat or doll-like drawing.

## Read only what the task needs

| Task | Read |
| --- | --- |
| Colours, outlines, shading, what B looks like | `references/style-guide.md` |
| Face, eyes, brows, mouth, adult vs child | `references/facial-design.md` |
| Hair silhouette, waves, gloss | `references/hair-design.md` |
| Writing or editing SVG paths, gradients, ids | `references/svg-techniques.md` |
| Groups, blink and talk frames, hidden overlaps | `references/animation-readiness.md` |
| Comparing to the reference, reporting results | `references/visual-review.md` |
| Which past files are evidence and what they prove | `references/evidence.md` |

Do not load the whole style bible or every reference by default.

## Known failures to avoid

These were observed in Mom v1 and the M1.1c eye test:
- doll-like proportions;
- circular eye openings;
- sharp or curly lash spikes;
- flat shading;
- mirrored, symmetrical hair curtains;
- plastic-looking circular highlights;
- weak adult identity;
- a generic vector look.

Each one has a fix in the matching reference.

## Workflow

1. **Prepare the reference.** Crop and enlarge the relevant reference region first. Note its size in pixels, because fine detail below about 100 px is reconstruction, not tracing.
2. **Build in parts.** Work part by part (eye, then face, then hair), with named groups from `references/animation-readiness.md`.
3. **Check structure:** `node <skill>/scripts/check-svg.mjs <file.svg>`.
4. **Export:** `<skill>/scripts/export-png.sh <file.svg> <out.png> [dpi]`. This uses Inkscape with a timeout, because the Inkscape CLI can hang.
5. **Compare** at the same displayed size: `node <skill>/scripts/compare-sheet.mjs --out <sheet.png> "Label=img.png" "Ref=ref.png@x,y,w,h" …`. Look at the sheet before judging.
6. **Report** following `references/visual-review.md`.

## Hard rules

- Keep experiments in `experiments/` or the scratchpad. Never overwrite existing artwork; new versions get a new file name.
- Never call art "accepted", "approved" or "production-ready". Only the owner decides that. Rights and production approval are separate gates.
- Don't register assets in `projects/momee/manifest.json` unless the task explicitly asks.
- Don't invent generation provenance (model, prompt, seed, licence).
