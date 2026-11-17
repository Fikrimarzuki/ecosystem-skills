# Coding workspace

## Protect attention and the learner's work

Keep the task, editable code, run control, and result easy to locate. On a wide screen they may be
adjacent; on a phone they may need tabs or a stacked layout. Switching views must preserve code,
selection where supported, output, and the current attempt. Do not turn a mobile visit into an
unusable miniature of a desktop split pane.

Keep the learner's draft separate from the starter example and the reference solution. Reset needs
a clear effect and a proportionate recovery path, such as undo or confirmation before discarding
edits. Returning from a lesson should not silently replace the draft. State the actual persistence
promise; do not describe an in-memory draft as saved across sessions.

Use the existing editor and runtime integration. UI design does not authorize replacing them,
adding dependencies, or executing learner code in the privileged application context.

## Make execution state explicit

Specify the observable behavior for each relevant state:

| State | What the learner needs |
| --- | --- |
| Ready | Runnable task, editable draft, identifiable Run action |
| Running | Text status, duplicate-run handling, cancellation or a documented time limit |
| Output produced | Current output associated with the attempt that generated it |
| Checks passed | Which learning criterion was satisfied; a next step |
| Checks failed | Expected versus observed behavior and a focused next action |
| Runtime or syntax error | Useful location/message and a route back to the code |
| Interrupted or unavailable | Preserved draft, an explanation, and a retry/recovery option |

Do not display old output as a new result. Editing code after a successful run should not make
an untested draft look verified. Successful execution and satisfying the exercise's checks are
different events; a program that prints something can still miss the task.

Give a concise status announcement when a run finishes, using the existing accessibility pattern.
Do not send every console line through an assertive live region or move focus away from the editor
after each keystroke. Keep full output inspectable without requiring a transient toast.

## Support debugging without replacing thinking

Tie feedback to a likely misconception, not a personal judgment. For example, “The loop ran one
extra time; compare the last value with the stopping condition” is more actionable than “Wrong.”
Offer a conceptual cue, then a location or smaller example, then a solution if the product allows
one. Preserve the learner's choice to retry before revealing more help.

## Keyboard and touch

Keep Run, Reset, hints, editor settings, and output reachable with predictable focus order and
clear labels. If Tab inserts indentation, expose and test the editor's way to leave that mode.
Avoid browser/assistive-technology shortcut conflicts; advertise any optional run shortcut beside
its visible button.

Check the on-screen keyboard, short viewports, safe areas, and returning focus after a dialog.
Use around 44 × 44 CSS px as a helpful target for frequently used touch controls where space allows.
[WCAG 2.2 SC 2.5.8 (AA)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
defines a 24 × 24 CSS px minimum with spacing and other exceptions; 44 px is not its AA threshold.

## Evidence to retain

Record which attempt produced the displayed output, how reset and navigation affect drafts, and
whether keyboard exit and the narrow layout were actually exercised. Label browser-only checks
separately from real-device and screen-reader observations.
