# Animation readiness

The full component list, draw order and pivots are in `projects/momee/styles/soft-storybook-adventure/docs/mom-visual-spec-v1.md` §4. Use those names. The runtime rig, which you must not modify from this skill, is `app-momee/apps/web/src/adventure/cutout/rig.ts`.

## Group structure for a head

This structure is used by `projects/momee/styles/soft-storybook-adventure/characters/mom/source/mom-head-v1.svg` and is fine to keep:

```text
hair-back > neck > head (ears, face-base, shading, blush, nose) > facial-features (brows, eye-left, eye-right, mouth) > hair-front > highlights
```

- **One group per swappable part.** Each eye, each brow and the mouth are their own groups.
- **Frame variants** are sibling groups with a suffix (`eye-left--open`, `eye-left--closed`, `mouth--talk-a`). Only one is visible in a given export.

## Frames: priorities and rules

| Animation | Needs | Rule |
| --- | --- | --- |
| Blink | open, half and closed eyes | Every frame sits on the same canvas and anchor, and includes the lid skin it covers. The closed lash must match the open lash in colour and weight. |
| Talk | neutral, small-open and wide-open mouths | Mouth shapes share a centre. Inner-mouth colour is a warm dark rose, not black. |
| Idle | head bob, hair-back sway, torso breathing | The neck extends under the chin and the collar. Hair-back extends behind the shoulders. |
| Wave | arm split at shoulder, elbow and wrist; open hand | Shoulder caps, the torso behind the raised arm, and the forearm inside the sleeve must exist as hidden art. |

## Hidden overlaps (always draw them)

These parts must exist even though the reference never shows them:
- neck under the chin and collar;
- skull behind the fringe;
- skin under the eyes and mouth;
- shoulders behind the hair;
- limbs inside sleeves and cuffs.

**Check:** temporarily hide each moving part and confirm nothing behind it is a hole.

## Turning and views

¾ and side heads are **separate drawings**, not rotations of the front view.

## Customisation without an engine

- Keep the group names stable.
- Keep colours in `grad-`-prefixed gradients (`grad-hair-*`, `grad-skin*`, `grad-iris*`, `grad-outfit-*`).
- Draw hairstyles and outfits as swappable groups on the same anchors.
