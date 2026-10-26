# Facial design

**Evidence:** Mom v1 read "younger and rounder" and "sticker-like", with sharp lash flicks (`characters/mom/review/mom-head-v1-review.md`). The owner judged it doll-like, with eyes that were too circular. The M1.1c eye test fixed the opening shape, but its lash spikes were still too curly and its lid shade showed as a blob (`docs/mom-art-direction-feasibility-v1.md` §3).

## Adult vs child

These are general character-design guidance, not measured from Momee. Treat the numbers as starting points and adjust against the Candidate B crop.

| Feature | Child (Boy, Girl) | Adult (Mom, Dad) |
| --- | --- | --- |
| Eye line | Below the head's vertical midpoint | Near the midpoint |
| Eye width | Large: about ¼ or more of the face width | Smaller: about ⅕ of the face width, wider than tall |
| Eye shape | Round opening | Almond: flatter lower lid, an upper lid curve peaking off-centre toward the inner third, and a visible crease |
| Lower face (eyes to chin) | Short; chin close to the mouth | Longer; more space between the mouth and the chin |
| Cheeks and jaw | Full, wide and round | Softer taper toward a defined but rounded chin |
| Brows | Short and high | Longer, shaped, closer to the eye |
| Nose | Dot or none | A small soft mark plus an optional faint bridge shadow |
| Neck | Short and wide | Longer and slimmer |

Momee adults stay storybook-soft. Push one or two of these features, not all of them.

## Eye construction

This is the order that worked in M1.1c. Draw back to front:

1. **Opening shape:** a closed almond path used as a `clipPath`, not an ellipse. Put the peak of the upper lid off-centre toward the inner third, and keep the lower lid flatter.
2. **Eye white:** a slightly warm white, with a vertical gradient grey-pink at the top to warm white at the bottom. The darker top is the shadow cast by the upper lid.
3. **Iris:** an ellipse taller than it is wide, cut off by the upper lid (about 20–30% hidden). Use a vertical gradient from dark at the top to warm amber at the bottom, plus a soft bottom glow and a thin darker ring.
4. **Pupil:** a slightly oval shape, centred or a little high.
5. **Lid shadow:** a soft, semi-transparent band along the top of the opening, clipped.
6. **Highlights:** one main highlight at the upper left as a soft rounded blob (two curves, not a circle), and an optional small secondary one at the lower right at lower opacity.
7. **Upper lash mass:** a filled tapered path, thickest at the outer third. It ends in **one soft flick** that curves out and down, or two short rounded ones. Never use several sharp spikes or curls.
8. **Crease:** a thin tapered line above the lid that follows the upper lid curve, lighter than the lash.
9. **Lower lid:** a short, light, tapered stroke on the outer half only.

**Lid shading:** don't place a large radial-gradient ellipse over the lid, because its edge reads as a blob. Use a shape that follows the crease and fades out, or leave the skin plain.

## Brows, mouth, blush

- **Brows:** a tapered filled path (thick at the inner end, thin at the outer end) with a gentle arch. Use the hair colour, slightly lighter.
- **Mouth:** a neutral smile is one tapered line with lifted corners and an optional tiny lower-lip shadow. Avoid a closed "U" shape, which reads childlike.
- **Blush:** a soft radial gradient fading to 0 opacity, set horizontally on the outer cheek and below the eye. It is never a visible edged disc.
