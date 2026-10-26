# Style guide: Soft Storybook Adventure, Candidate B

**Sources:**
- **Rules and fidelity policy:** `app-momee/docs/design/visual-style-bible.md` §13. That file is in the sibling app repository; read only §13.
- **Mom identity:** `projects/momee/styles/soft-storybook-adventure/docs/mom-visual-spec-v1.md` §2–§3.
- **Candidate assessment:** `…/docs/mom-art-direction-feasibility-v1.md` §1.

This file adds only what those documents do not say about drawing.

## What Candidate B looks like

Observed on the exploration sheet, middle column.

- **Shapes:** clean, smooth and rounded. Every curve has a direction change somewhere, and there are no perfect circles or ellipses in the visible silhouette.
- **Outlines:** thin, warm, dark brown (never black). The weight varies: heavier on the outer silhouette and under the chin and hair masses, lighter or absent on inner details (cheeks, nose, inner hair lines). "Selectively stronger" means the outer silhouette and the upper lash line, not everything.
- **Shading:** one soft shadow tone and one highlight per area, delivered as gradients and soft-edged shapes rather than hard cel bands. Shadows are warm on skin (peach to rose) and cool-grey only on eye whites under the lid.
- **Hair:** large smooth wave masses, a few long strand lines, and soft light streaks that follow the wave direction. No noise texture.
- **Faces:** a slightly long oval with a soft jaw; almond-leaning eyes with a lid crease; a calm small smile; and blush as a soft gradient, not a hard disc.
- **Finish:** smooth, without A's paper grain. Depth comes from gradient layering, not texture.

## Palette

Use the sampled colours in `projects/momee/styles/soft-storybook-adventure/docs/mom-visual-spec-v1.md` §1–§2:
- skin about `#fedebf`;
- hair `#84442d`, with highlight `#c5704d`;
- sheet palette swatches.

Sample from the reference crop before inventing a colour. Shadow colours are the base hue moved warmer and darker, not grey.

## Outline technique

- **Stroked paths with a gradient-filled shape underneath:** best for editability. Use `stroke-linejoin="round"` and `stroke-linecap="round"`.
- **Tapered line art** (lash, crease, hair strand ends): draw a filled closed path that thins to a point. A plain stroke has uniform width, which looks mechanical.
- **Line colour:** use a darker shade of the fill it borders (hair line about `#5a2818`, skin line about `#c07a5e`) rather than one global outline colour.

## Generic-vector warning signs

Fix these before review:
- uniform stroke width everywhere;
- pure circles and ellipses as visible features;
- perfect left/right mirroring;
- flat fills with no gradient;
- highlights as perfect white circles;
- all edges at the same sharpness.
