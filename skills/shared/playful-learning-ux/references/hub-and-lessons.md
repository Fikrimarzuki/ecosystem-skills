# Hub and lessons

## Hub: an invitation with an obvious next step

Make “continue learning” easy to find, with the current lesson's name and meaningful progress.
Keep exploration available through topic or level navigation. A map can provide personality, but
offer the same destinations in a readable list; map coordinates must not determine keyboard order.

Distinguish available, started, completed, and unavailable items in words as well as visually.
Explain a real prerequisite beside the affected activity. Do not introduce new content gates as a
styling choice. Empty progress is a valid first visit, not an error or a reason to show fake achievements.

Favor evidence-based progress labels such as “3 of 5 practice tasks completed.” Keep estimates
such as reading time visibly approximate. An XP total is not a substitute for a learning path.

## Lesson: enough room for the concept

Establish one reading column with a comfortable measure; roughly 55–75 characters is a starting
point for prose, subject to the typeface, language, and audience. This is a design heuristic, not a
WCAG requirement. Allow headings, examples, and activities to determine grouping rather than
putting every paragraph inside another card.

Keep the objective, explanation, example, practice, and next step recognizable. Use an existing
content sequence when one exists. For beginner programming, consider a worked example followed
by prediction, running, investigation, modification, and a small independent task where that
sequence suits the objective. Do not force five stages onto every short lesson.

Put hints and extra explanation close to the decision that needs them. Disclose optional material
without hiding essential instructions. Keep navigation stable while reading; celebration and
mascot prompts should wait until a meaningful break.

Code samples need selectable text, a language label when useful, and a deliberate overflow policy.
Let prose reflow. Keep any necessary code scrolling inside the code region, with a visible focus
indicator and a usable keyboard route. Avoid shrinking the whole lesson to fit a wide sample.

## Localization and small screens

Use the project's shipped languages and check actual translated labels. Leave identifiers and code
syntax intact while translating explanations. Explain unfamiliar programming vocabulary alongside
the example; avoid using a metaphor that changes the technical meaning between languages.

On a phone, keep reading and the next action in one understandable flow. Collapse optional sidebars
without losing their destinations. Check enlarged text and long labels before shortening meaningful
instructions. A floating navigation bar must not cover the last example or the next-step control.

[WCAG 2.2 Reflow (AA)](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
uses 320 CSS px for vertically scrolling content, with exceptions for content that needs a
two-dimensional layout. An exception for a code region or diagram does not exempt the surrounding lesson.

## Useful specification output

Describe the resume action, topic navigation, progress meanings, lesson hierarchy, one example
activity, and empty/error states. Identify what becomes secondary on a phone. Use the existing
token system; record any proposed change to spacing or type as a decision to review.
