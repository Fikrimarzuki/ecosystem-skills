# KodeStep LX review and activation

Completed 2026-11-18 (Asia/Jakarta). Follow-up to the [preparation audit](kodestep-lx-preparation.md).
This milestone reviews and activates skills; it does not implement KodeStep LX-0.

## Final selection and owner decisions

| Skill                            | Role                                                                     | Registry decision                                                                    |
| -------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `frontend-design`                | Visual direction, typography, tokens and visual critique                 | Existing approved external pin and assignment preserved                              |
| `writing-plans`                  | Turn an agreed direction into a scoped implementation plan               | Existing approved external pin and assignment preserved                              |
| `verification-before-completion` | Require current evidence for completion claims                           | Existing approved external pin and assignment preserved                              |
| `playful-learning-ux`            | Learning flow, focused coding, hints, challenges and accessible feedback | First-party content reviewed; new owner-authorized assignment                        |
| `stylized-game-art`              | Canonical character identity, art bible and asset review                 | New owner-authorized first-party assignment; existing content/review state preserved |

All five are assigned to **Claude Code and Codex**, using relative symlinks. The two new first-party
assignments carry verified status only for the explicit read-only smoke tests described below.
The existing three assignments keep their original `unverified` values; discovery evidence was added separately.

`gateway-mobile-checklist` is available only for an explicitly requested mobile audit and was not added to the
consumer. Impeccable, Anti-Slop, GSAP curated releases, Web Quality Accessibility curated releases,
Phaser/Three.js additions and all other unapproved external skills are deferred for this milestone.
No approval decision, source pin, release, external installation, or other consumer assignment changed.

## First-party content review

Read in full:

- [SKILL.md](../skills/shared/playful-learning-ux/SKILL.md), 79 lines;
- [Hub and lessons](../skills/shared/playful-learning-ux/references/hub-and-lessons.md), 54 lines;
- [Coding workspace](../skills/shared/playful-learning-ux/references/coding-workspace.md), 63 lines;
- [Challenges and feedback](../skills/shared/playful-learning-ux/references/challenges-and-feedback.md), 63 lines.

The review found **no blocking instruction-safety or scope issue**. No content changes were needed.
`registry/skills.json` now records `playful-learning-ux` as **reviewed**, with the date, reviewer,
content hash and findings. It was not set to `approved`: first-party content does not need third-party
approval, and the owner's assignment authorization is a separate decision.

| Review question                  | Finding                                                                                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing first-party conventions | Matching kebab-case folder/frontmatter name, scoped 381-character description, agent-neutral Markdown, existing category and relative internal references; no mandatory tool/skill dependency                                                   |
| Unsafe instructions              | No scripts, binaries, special files, hooks, tool grants, installs, credential requests, permission overrides or remote instruction-loading workflow. Background links are references, not executable instructions.                              |
| Duplication with Frontend Design | Limited shared usability principles are contextualized for learning. Palette/type/token/art decisions remain with the existing visual and art workflows; the new value is learning criteria, progression, attempt identity, hints and recovery. |
| Bilingual educational UX         | Uses shipped languages and actual translated labels, preserves code syntax/identifiers, checks longer labels, and asks for consistent technical meaning across languages. It does not generate or translate the curriculum automatically.       |
| Focused coding and debugging     | Task/code/output hierarchy, phone view switching, draft preservation, reset/recovery, run/check/error/interrupted states, stale-output handling, expected/observed feedback and progressive hints                                               |
| Navigation and challenges        | Resume, prerequisites, readable alternatives to maps, semantic controls, explicit learning criteria, retries, honest progress and nonpunitive rewards                                                                                           |
| Accessible feedback              | Keyboard/editor escape, focus return, text and restrained announcements, color-independent results, reduced-motion alternatives and completion independent of animation callbacks                                                               |

Repository scan: **4 Markdown files, 16,056 bytes, zero heuristic hits, scripts, binaries or special files**.
All internal links resolve; there are no out-of-folder references.

Reviewed content hash:
`sha256-90ba2c7eaf2e8d67f5fac0cb7712739999b50f9d8e543752a2c64e41b99fd224`.
The static review does not certify educational effectiveness, full WCAG accuracy or application behavior.
The preparation report's PyYAML helper limitation remains; no package was installed to work around it.

## Registry and location changes

- `registry/skills.json`: only the new learning skill's review metadata changed in this follow-up.
  All existing external approval records and all skill content bytes were preserved.
- `registry/consumers.json`: appended `playful-learning-ux` and `stylized-game-art` to `kodestep`;
  each uses both supported agents and `install: symlink`. Existing assignments and other consumers are unchanged.
- `registry/evidence.json`: appended ten records: six discovery-only records for the three existing skills
  on two agents, plus four explicit first-party invocation records. Previous evidence records are unchanged.
- Ignored `consumers.local.json`: retained its existing mapping and added the verified KodeStep location.
  Machine-specific paths and raw traces stay outside the public registry/catalog.

The activation destination was established from existing trusted records rather than guessed:
the consumer registry names `porto-projects/learn-kodestep`; its parent matches the current workspace;
the existing directory is a real Git repository on `main` with origin `Fikrimarzuki/learn-kodestep`;
and both agent folders already contained the three expected links into ecosystem-skills.
No top-level workspace file supplied a conflicting location. No Git initialization was performed.
After these checks, `../learn-kodestep` was recorded in the ignored consumer location configuration.

## Filesystem synchronization

The registry CLI preview reported six correct existing links and exactly four proposed additions, with
no conflicts or directory creations. Applying that plan created only:

```text
.claude/skills/playful-learning-ux
.claude/skills/stylized-game-art
.agents/skills/playful-learning-ux
.agents/skills/stylized-game-art
```

Targets are the corresponding canonical `skills/shared/` folders in ecosystem-skills, reached through
relative symlinks. No copy, overwrite, prune, source download or external installation was performed.
All six existing links were retained. `skills:verify kodestep` reports **0 errors and 0 warnings** for
all ten links and the approved external install hashes; a repeated sync preview reports **nothing to do**.

KodeStep was clean before synchronization. Its only resulting Git status entries are the four untracked
symlinks above. The tracked diff remains identical to the baseline. Application code, learning content,
package files and other configuration were not modified. All authored review/report/registry changes are
inside ecosystem-skills; the four skill links are the expressly authorized activation exception.

## Discovery and runtime evidence

| Skill                            | Filesystem exposure       | Claude Code discovery | Codex discovery | Explicit runtime invocation in this milestone             |
| -------------------------------- | ------------------------- | --------------------- | --------------- | --------------------------------------------------------- |
| `frontend-design`                | Both agent links verified | Pass                  | Pass            | Not tested; assignment remains unverified                 |
| `writing-plans`                  | Both agent links verified | Pass                  | Pass            | Not tested; assignment remains unverified                 |
| `verification-before-completion` | Both agent links verified | Pass                  | Pass            | Not tested; assignment remains unverified                 |
| `playful-learning-ux`            | Both agent links verified | Pass                  | Pass            | Pass on both agents; one read-only brief review per agent |
| `stylized-game-art`              | Both agent links verified | Pass                  | Pass            | Pass on both agents; same bounded brief review            |

**Claude Code 2.1.309.** Fresh print-mode host initialization listed all five names. A discovery-only
session with no tools subsequently said it lacked model-visible skill metadata; the host `init.skills`
event, not that prose response, establishes discovery. A separate fresh session exposing only `Skill`
and `Read` invoked both first-party skills and successfully read both SKILL.md files plus
`coding-workspace.md` and `art-bible-template.md` through KodeStep's `.claude/skills` links. It exited 0
with no permission denials, no application reads and no writes.

**Codex CLI 0.167.1.** A fresh local app-server `skills/list` request for the verified consumer cwd
returned all five names as enabled `repo` skills, with the expected canonical paths and no discovery
errors. That query started no model turn. A separate ephemeral `codex exec` session, with read-only
sandbox, user configuration ignored and hooks disabled, read the same four selected files through
`.agents/skills` paths; every read and the session exited 0. Stderr contained nonfatal state-database
fallback warnings. The initial sandboxed host query could not initialize Codex's state runtime; the
successful query used the normal reviewed tool escalation, without disabling approval or hook trust.

The [official skills documentation](https://learn.chatgpt.com/docs/build-skills) distinguishes initial
metadata discovery from selected instruction loading, supports repository `.agents/skills` discovery
and symlink targets, and distinguishes explicit from implicit invocation. Local evidence above is the
basis for these results, rather than documentation alone.

Both agents reviewed a hypothetical bilingual lesson with phone draft loss, motion/color-only errors,
confetti without a reduced-motion alternative, and inconsistent mascot proportions. Both proposed
brief-scoped fixes and labeled actual application behavior and learning outcomes unverified.
These are explicit instruction-loading and limited instruction-following smoke tests, not a real app audit,
natural-trigger test, visual-quality certification, controlled effectiveness study or implementation acceptance.

Public evidence IDs use `lx-activation-<skill>-<agent>` for the four first-party invocations and append
`-discovery` for the six existing-skill discovery records. Raw requests, JSONL traces, stderr and baseline
checks remain in ignored `external/.review/kodestep-lx-activation/` for local inspection.

## Repository validation

`pnpm check` passed under the actual pinned **pnpm 12.11.2**:

| Check                                          | Result                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace typechecking, ESLint and formatting  | Passed                                                                                                                                           |
| Registry and curated-library validation        | Passed: 265 skills, 20 consumers, 38 evidence records; existing 6 release folders verify                                                         |
| Catalog tests                                  | 403 passed in 26 files                                                                                                                           |
| Web tests                                      | 256 passed in 17 files                                                                                                                           |
| Static production build                        | Passed                                                                                                                                           |
| Consumer filesystem/integrity verification     | 0 errors, 0 warnings                                                                                                                             |
| Repeated synchronization preview               | Nothing to do                                                                                                                                    |
| Scope check against the pre-milestone baseline | Existing approvals, source pins, assignments, evidence and links preserved; KodeStep tracked diff unchanged; only four authorized symlinks added |
| `git diff --check`                             | Passed                                                                                                                                           |

Existing catalog/web evidence allowlists were updated to enumerate the ten new records; the first full
check exposed one remaining web allowlist, which was corrected before the final passing run.
No schema, security rule or approval gate was changed. The new skill's name/frontmatter/description,
hash and internal links also passed the repository-based checks; its content remained byte-identical.
The final report/comment-only edits were followed by formatting and whitespace checks.

No KodeStep application test, build or browser audit was run or is claimed for this link-only activation.

## Blockers and LX-0 readiness

The five-skill selection is assigned, synchronized and discovered by both supported agents. The two added
first-party skills have actual explicit loading/invocation evidence. The existing three retain their earlier
runtime-verification state. Their discovery is established independently.

**KodeStep LX-0 is ready to start as a separately requested planning/specification task.** The deferred
external skills are not prerequisites. Use explicit skill invocation initially; preserve the distinction
between a loading smoke test and evidence that a redesign works for learners.

Natural triggering, full workflows for the three existing skills, real application accessibility/behavior,
screen-reader/device checks and learner outcomes remain untested. They are follow-up verification work,
not a reason to install the deferred bundles. No learning content or LX implementation was started;
no commits, pushes, deployments or global agent configuration changes were made.
