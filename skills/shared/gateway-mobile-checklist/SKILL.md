---
name: gateway-mobile-checklist
description: A short, measurable checklist for auditing phone-width usability of an existing web UI. Use only when the user explicitly asks for a mobile layout audit, a responsive usability review, a mobile navigation or touch-target check, or an investigation of a mobile UI regression. Do not use for general frontend work or visual design; that is frontend-design's job.
---

# Gateway Mobile Checklist

Use this when the user explicitly asks to check, audit or debug how an existing interface behaves on a phone. It complements
`frontend-design`, which owns visual direction. This checklist never decides how the interface should look. It only finds places
where a phone user cannot read, reach or operate something, and separates those from matters of taste.

Do not apply it to ordinary feature work, and do not let it override an approved design.

## How to work

1. Pick the widths that matter for the project (at minimum one phone width such as 390 px and one narrow width such as 320 px,
   plus the desktop width for comparison) and the themes and languages it ships.
2. Measure instead of guessing: read the computed layout in a real browser or the project's existing browser tests when they exist.
   If you cannot measure, say so and mark the finding as unverified.
3. Report what you found, then stop. Change code only when the user asks, and keep fixes to the smallest component-level change.
   Do not add dependencies or redesign.

## The checks

For each check, a defect is something measurable. Anything else is a preference.

1. **Reflow.** Multi-column content must stay readable at phone width: columns stack, wrap or shrink instead of being squeezed into
   slivers or overlapping. Fixed pixel tracks and fixed-width children are the usual cause. Defect: text or controls collide or
   become unreadable. Preference: a different column count that still works.
2. **Horizontal overflow.** The page must not scroll sideways at the target widths. Compare `scrollWidth` with `clientWidth` and find
   the widest element. Defect: any unintended sideways scroll or content cut off by the viewport. Not a defect: a deliberate
   scroll container such as a code block or a letter bar.
3. **Touch targets.** Treat 44 x 44 px as a useful default for primary and frequently used controls, and make sure neighbours are
   separated enough to avoid mistaps. Defect: a primary control too small to hit reliably, or targets that touch. Judgement: dense
   secondary controls, inline links within text, or controls that already meet a platform minimum.
4. **Icon-only controls.** Every icon-only button or link needs an accessible name in each shipped language, and the name must say
   what it does. Defect: no name, an empty name, or an English name in a translated page.
5. **Hover-only content.** Anything revealed only by hover must also be reachable by tap and by keyboard. Defect: content or
   navigation that touch or keyboard users cannot open.
6. **Spacing and type.** Text must stay readable and not be clipped or forced to overflow at phone width. Defect: headings or
   labels that overflow, clip, or leave unreadably short lines. Preference: a different type scale or padding that still reads well.
   Do not apply a blanket padding formula.
7. **Fixed navigation and safe areas.** A fixed bar must not hide the last content or controls, and it must respect device safe
   areas and the on-screen keyboard where relevant. Defect: content unreachable behind a fixed bar. Do not require a bottom
   navigation; judge whatever pattern the project uses.
8. **Sticky headers and toolbars.** Fixed or sticky chrome should leave most of a short phone screen for content. Defect: chrome
   that leaves too little visible content to work with. Preference: a taller header that still works.
9. **Dropdowns.** Selected text must not run under the chevron or clip against the border, and the chevron needs clear space from
   the edge. Check the longest option in each language. Defect: clipped or overlapping text.
10. **Focus and interaction.** Keyboard focus is clearly visible on every control, dialogs keep focus inside while open and return it
    to the opener on close, and there is no keyboard trap. Defect: invisible focus, focus lost to the page behind a dialog, or a
    control that cannot be operated without a pointer.

## Reporting

For each finding give the location, the measurement or observation, whether it is a **defect** (measurable failure) or a
**preference** (taste, or a rule of thumb that is not clearly broken here), and the smallest fix. List what you checked and found
fine, and anything you could not verify. Keep the report short, and do not claim a page is mobile-ready beyond the widths,
themes and languages you actually checked.
