# Hair design

**Evidence (Mom v1, M1.1b):**
- **Ribbon locks:** a draft made of tapered "ribbon" locks looked procedural and was abandoned.
- **Final v1:** a single smoothed silhouette with mirrored wave troughs and glints. It read "simpler", "flatter" and too symmetrical.

See `characters/mom/review/mom-head-v1-review.md`.

## Mom's hair: what must read

From `projects/momee/styles/soft-storybook-adventure/docs/mom-visual-spec-v1.md` §2:
- long reddish-brown waves past the shoulders;
- a side part right of centre;
- a soft swept fringe across one side;
- face-framing locks;
- glossy crown highlights;
- darker inner shadows between waves.

## Construction

1. **Silhouette first.** Draw the outer shape as one closed path with clear wave bulges. Build it from about 20–30 hand-placed points, not generated ones.
2. **Break the symmetry on purpose.** The side part moves the volume:
   - the larger side drops lower and wider;
   - the waves on the two sides peak at different heights;
   - one side tucks behind the shoulder, and the other falls in front.
   Never mirror a whole side; if you start from a mirror, move each wave by hand afterwards.
3. **Overlapping masses.** Split the hair into 3–5 large clumps that overlap, like S-shaped ribbons stacked front to back. Each clump has its own gradient, lighter where it turns toward the light. Separation comes from a darker shadow shape where one clump tucks under another, not from outlines everywhere.
4. **Gloss.** Highlights are long, thin, tapered shapes that follow the wave direction and sit on the outward bulge of each wave. Use a few, at varied lengths and opacities (0.3–0.6). Short repeated glints in a row read as plastic.
5. **Strands.** Use 3–6 thin, tapered lines that break the large masses, mostly near the part and at the ends. They must taper at both ends.
6. **Ends.** Finish in soft curled points of different lengths, not one even scalloped edge.
7. **Fringe and front locks** go in `hair-front`, overlap the forehead, and cast a soft shadow shape on the skin underneath (a separate path in `head`).

## Animation constraints

- **Layers:**
  - `hair-back` sits behind the head and body;
  - `hair-front` holds the fringe and face-framing locks;
  - locks that fall over the shoulders in front of the body go in their own group (`hair-front-lock-*`), so arms and shoulders can move between the layers.
- **Hidden overlaps:** draw the hidden part of each lock past where it disappears (under the fringe, behind the shoulder), so moving parts don't open gaps.

## Customisation

- **Colour:** keep hair colour only in gradients named `grad-hair-*`, so recolouring means editing the stops.
- **Hairstyles:** a hairstyle is a swap of `hair-back` and `hair-front` on the same head anchor.
