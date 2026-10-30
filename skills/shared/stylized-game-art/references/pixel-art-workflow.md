# Pixel-art workflow

1. **Fix the grid.** One tile size (16 px is a good default for cozy interiors) and one character size (for example
   16×24). Every sprite uses the same pixel density; never scale a sprite by a non-integer factor inside the scene.
2. **Pick the camera.** Top-down three-quarter ("RPG interior") shows furniture fronts and floors and needs four facing
   directions (down, up, side ×2 by mirroring). Side view suits vignettes. Isometric is optional, not the default.
3. **Block silhouettes first** in a single dark colour at native size. If the character is not recognisable as a solid
   shape, shading will not save it.
4. **Palette-indexed authoring.** Author sprites as indexed grids (characters as letters for roles: outline, base,
   shade, highlight, accent) so colour options become ramp swaps, not tints. Keep 3–4 tones per material.
5. **Outlines.** Choose one rule and keep it: a single dark ink outline, or selective (coloured) outlines. Avoid pure
   black; a dark desaturated purple-brown reads softer.
6. **Light from one side.** Top-left light is conventional; put highlights on top/left edges and shade the bottom/right.
7. **Faces.** At 16 px, eyes are 1–2 px; expression lives in eye shape and a 2–3 px mouth. Blush is one or two pixels.
8. **Layers for customisation.** Body, head (per species), hair/hats, accessories and face as separate layers composited
   at native resolution in a fixed order, then cached.
9. **Animation.** Walk: 2–4 frames per direction, alternating feet plus a 1 px bob. Idle: breathing (1 px) or blink.
   Sit and task frames are separate poses, not translated standing frames.
10. **Rendering.** Draw the whole scene at native resolution into an offscreen canvas, then scale by an integer factor with
    image smoothing disabled (`imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`). Snap every position to a
    whole native pixel. Sort by the sprite's foot line for depth.
11. **Lighting and weather.** Use palette shifts, dithered light pools and a few animated pixels (rain, flicker). Avoid
    smooth gradients and blurs that break the pixel grid.
12. **Review at 1× and at play scale**, on a dark and a light UI, before calling a sprite done.
