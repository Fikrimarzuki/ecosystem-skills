# Challenges and feedback

## Tie the game loop to the learning objective

Describe the loop as an action, an observable result, feedback, and a meaningful retry or next
challenge. A beginner debugging task might ask the learner to predict an outcome, change a loop
boundary, run it, and explain the difference. Its success criterion should evaluate the concept,
not the number of clicks or the time spent looking at a screen.

Use difficulty to change the amount of scaffolding or conceptual complexity. Do not make reading
speed, pointer precision, sound recognition, or a countdown the hidden test unless that ability
is itself the documented objective. Preserve an accessible way to complete the same objective.

A quest list can be ordinary semantic HTML. Choose an engine only when the requested interaction
needs a game loop, physics, or spatial rendering, and after checking the project's actual versions.
Canvas controls need an accessible interaction plan; decorative game styling alone is not a reason
to move lessons, forms, or essential navigation into a canvas.

## Reward understanding and return visits without pressure

Keep progress grounded in the product's actual completion criteria. Distinguish practice attempts,
mastered concepts, and optional exploration if the product tracks them. Explain what an earned
badge means, and do not infer mastery from points alone.

Prefer a useful next challenge, optional replay, and specific encouragement. Do not introduce
punitive streak loss, public ranking, forced daily participation, or random reward loops as a
default redesign feature. Learners should be able to stop and return without shame or lost work.

## Keep the mascot recognizable and useful

Take identity, proportions, palette, poses, and expression limits from the project's art bible.
Define the few states the interface needs, such as welcome, hint, encouragement after an error,
and completion. Reuse approved artwork rather than generating a slightly different character
on each screen. If no identity exists, propose one for review before expanding the pose set.

Keep advice in real text. A decorative mascot should not add a redundant screen-reader stop;
an interactive mascot needs an accessible name and a predictable action. Let learners dismiss
optional prompts. Avoid interrupting typing or using disappointed expressions to punish mistakes.
Character production and asset licensing belong to the project's existing art workflow.

## Motion communicates a state; it does not gate it

For each effect, specify the triggering event, purpose, normal presentation, reduced-motion
alternative, interruption behavior, and whether sound is involved. Prefer existing CSS/platform
capabilities for simple transitions; a redesign does not automatically need a motion library.

With reduced motion, replace nonessential travel, bouncing, shaking, and confetti with a stable
state change or text/icon feedback. Results and navigation must remain available immediately;
do not wait for an animation-complete callback to unlock the next action. Avoid flash effects.
Test changing the preference while the page is open if the implementation supports it.

[WCAG SC 2.3.3 (AAA)](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
addresses disabling nonessential interaction animation. Separately,
[SC 2.2.2 (A)](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
requires pause/stop/hide for qualifying automatic motion lasting over five seconds beside other
content, and controls for qualifying auto-updates. A reduced-motion preference alone does not
establish that every applicable requirement is met.

## Useful specification output

Provide a small state table with the learning criterion, hint progression, failure/retry behavior,
reward meaning, mascot pose reference, and reduced-motion alternative. Review one successful
attempt and one unsuccessful attempt. Identify behavior that still needs learner testing.
