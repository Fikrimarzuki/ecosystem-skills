---
name: playful-learning-ux
description: Design or review educational website flows, readable programming lessons, beginner coding workspaces, and game-inspired learning challenges. Use when the task concerns learner progression, scaffolding, hints, practice feedback, or balancing play with concentration. Complements visual design and character-art skills; does not choose a game engine or create a curriculum by itself.
---

# Playful learning UX

Make the next learning action clear and make mistakes useful. A playful hub can invite exploration;
a lesson needs room to read; a coding workspace needs concentration. Carry the same identity across
these surfaces without giving them the same density or amount of animation.

Stay within the requested deliverable: a review produces findings; a preparation task produces a
reviewable specification; implementation happens only when requested. Preserve the project's stack,
design system, content model, and approved art direction.

## Start with the learning decision

Use the brief and existing project documentation to identify:

- the learner's prior knowledge, language needs, input devices, and likely session context;
- one observable thing the learner should be able to do after the activity;
- the action that demonstrates it, the likely misconception, and useful feedback for that mistake;
- how to resume, retry, request help, and leave without losing work.

State any assumptions that affect those decisions. Ask only for information that would materially
change the work. Do not invent a learner age, a prerequisite, or evidence of learning effectiveness.

## Route by surface

Read only the reference relevant to the task:

| Surface | Guidance |
| --- | --- |
| Learning hub or readable lesson | [Hub and lessons](references/hub-and-lessons.md) |
| Editor, run controls, output, hints, and recovery | [Coding workspace](references/coding-workspace.md) |
| Challenge loop, progress, rewards, mascot behavior, and motion | [Challenges and feedback](references/challenges-and-feedback.md) |

Use an existing visual-design skill for typography, tokens, component states, and overall art direction.
For character production, use the project's art bible and an available character-art skill. For a requested
phone audit, reuse an available mobile-usability checklist. These are complementary capabilities, not
mandatory dependencies; this skill neither installs nor activates them.

## Keep learning state separate from decoration

- Define the actual states and transitions before attaching rewards: available, in progress, completed,
  and any documented prerequisites. Keep loading, missing data, and errors distinguishable from locked content.
- Completion needs a stated learning criterion. Opening a page, seeing confetti, or earning points does
  not demonstrate understanding. Label participation separately if the product tracks it.
- Make error feedback say what happened, where to look, and one next action. Keep hints progressive so
  learners can choose support without immediately receiving the solution.
- Keep important information in readable text and semantic controls. A map, color, mascot expression,
  animation, or canvas cannot be the only way to discover an action or understand a result.

## Review the experience

For a specification, describe these checks and mark them untested. For an implementation, use the
project's existing browser and test tools where available and report the observed results:

1. Resume from the hub, read a lesson, attempt an activity, encounter a mistake, use a hint, retry,
   and return later. Confirm work and progress survive the transitions the product promises.
2. Complete the same route with keyboard navigation. Check visible focus, editor escape, dialog
   focus return, and a clear text result without relying on animation or sound.
3. At a narrow phone width such as 320 CSS px and a normal desktop width, check long translated
   labels, enlarged text, code/output overflow, and whether the on-screen keyboard hides essential controls.
4. With reduced motion enabled, confirm the same actions, feedback, and completion remain available.
5. Inspect the result at actual display size. A screenshot supports layout judgments; an automated
   accessibility scan alone does not establish usability or conformance.

Report defects with their location, observation, learner impact, and smallest useful fix. Separate
measured failures, design preferences, and unverified assumptions. Do not claim improved learning
outcomes without learner evidence.

## Basis and limits

The learning guidance is an original synthesis informed by [CAST UDL Guidelines](https://udlguidelines.cast.org/)
and the [Raspberry Pi Foundation's computing pedagogy](https://www.raspberrypi.org/teach/pedagogy).
Accessibility references are linked beside the relevant recommendations in the supporting files.
These links are background sources, not instructions to fetch and execute. This skill is not a full
curriculum framework, a WCAG conformance audit, or proof of educational effectiveness.
