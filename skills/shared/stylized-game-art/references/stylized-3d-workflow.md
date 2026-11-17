# Stylized 3D workflow (web)

1. **Model as forms, not parts.** Characters should be continuous surfaces with a designed silhouette: sculpt in a DCC
   tool, or script-sculpt with signed-distance shapes blended by smooth unions and mesh the result (marching cubes),
   then simplify. Separate meshes only where the rig needs joints or customisation needs another colour.
2. **Low, even density.** Budget triangles per character (for example 2–6k) and check the silhouette from the game
   camera, not from a close orbit view.
3. **Colour without many materials.** Bake zones (muzzle, inner ear, cheeks) into vertex colours or a tiny gradient
   texture; let customisation tint a base material whose vertex colours multiply it.
4. **Rig for shared animation.** Name joints consistently across species (root, body, head, armL/R, legL/R, plus
   optional ears, tail). Pivots at anatomical joints. Small secondary bones (ears) give personality cheaply.
5. **Export glTF/GLB.** Y-up, metres, applied transforms, no unused attributes. Record how the file was produced. Use
   `gltf-transform` (or the project's pipeline) for simplification and compression when files grow.
6. **Shading.** A stepped toon ramp or soft Lambert with one key light, a fill, and cheap contact shadows (blob or
   baked). Real-time shadows only on the highest quality.
7. **Merge static props per material**, instance repeated props (books, lights), share materials and geometries, and
   dispose GPU resources when a scene unmounts.
8. **Camera framing per view.** Each presentation (overview, close-up) is a framing of the same scene, chosen so the
   character's face is visible; use near-plane cut-aways rather than separate scenes when furniture would occlude.
