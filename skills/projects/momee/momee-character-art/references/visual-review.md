# Visual review

A file that renders is not a visually successful file. Judge only from a comparison sheet you have actually looked at.

## Comparison sheet

Use `scripts/compare-sheet.mjs`:
- Put the **reference crop** and the **new render** side by side at the **same displayed height**. Add the previous version when you are improving one.
- Add one enlarged detail row for the part under work (an eye, the fringe).
- **Reference crop coordinates** (exploration sheet, 1536×1024):
  - the Candidate B eye tile is at `541,730,112,109`;
  - measure other crops yourself and record them.

## Checklist

Answer each item honestly, with "yes", "no" or "partly", and say why:

1. **Identity:** same character as the reference? Clearly an adult (for Mom and Dad)?
2. **Eyes:** almond opening, lid crease, the iris cut by the lid, soft lashes with no sharp spikes, no circular sticker eyes?
3. **Proportions:** eye line, eye width and lower-face length compared with the reference at the same size?
4. **Hair:** asymmetric silhouette, overlapping clumps, gloss that follows the waves, varied ends?
5. **Shading:** gradients and a soft shadow per area? No visible gradient-edge blobs? Highlights not plastic?
6. **Line:** varied weight, warm colours, the silhouette stronger than the inner lines?
7. **Generic-vector test:** at thumbnail size, does it look like the reference style, or like stock vector art?
8. **Structure:** `scripts/check-svg.mjs` passes? Frames swap cleanly?

## Reporting wording

- **Separate the evidence types:**
  - **Observed** means you saw it on the sheet.
  - **Measured** means a script printed it.
  - **Assumption** means you believe it but have not checked it.
- **Status:** use "candidate for owner review" or "not visually successful yet". Never say "accepted", "approved", "final" or "production-ready".
- **State the gaps:** list the remaining differences from the reference, most visible first. Don't summarise a partial result as success.
- **Prior attempts:** a failed experiment is never a style example. Cite it only as "what not to do".
