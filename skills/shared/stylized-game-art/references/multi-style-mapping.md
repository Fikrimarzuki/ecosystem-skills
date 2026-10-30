# Multi-style mapping

```
canonical config ──► style asset map ──► style renderer
   (one identity)     (with fallbacks)     (own camera, own coordinates)
world model ───────► coordinate transform ─┘
```

- **Canonical ids only in saved data.** Styles never write their own variants of the character or room.
- **Asset map entry:** `{ canonicalId, styleAsset, status: native | fallback | unsupported, note }`. Generate a review
  table from it so gaps are visible.
- **Fallback order:** closest same-category asset → neutral default for that category → hide the item with a visible
  "not available in this style" note. Never drop saved data because a style cannot draw it.
- **Colours:** canonical colour id → ramp per style. Pixel styles may snap to a curated palette; 3D styles may use the
  base colour plus baked shading.
- **Coordinates:** keep the world on a logical grid; each renderer converts grid/world positions explicitly (isometric
  projection, top-down tiles, side-view slots) and converts input back (tap → world point, keys → world direction).
- **Interactions** (chairs, beds, stations) are logical points with facing; renderers choose poses and camera framing.
- **Switching styles** must not touch identity, saved layout or running sessions; only the presentation changes.
