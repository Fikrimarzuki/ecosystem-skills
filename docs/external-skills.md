# External skills: discovery, review, installation

Third-party skills are **untrusted until approved by the owner**. Their files are data during review: nothing in a
downloaded skill is executed, and instructions inside it are never followed while reviewing.

## Lifecycle — where each state lives

| State          | Meaning                                                     | Recorded in                                                           | Public catalog         |
| -------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------- |
| **Discovered** | Source located and pinned; not reviewed                     | `registry/skills.json`, `review.status: "unreviewed"`                 | yes                    |
| **Reviewed**   | Scanned and read; findings recorded; **no decision**        | `review.status: "reviewed"` + `revision` + `contentHash` + `findings` | yes                    |
| **Approved**   | Owner decision to allow installation of this exact revision | `review.status: "approved"` + `approvedBy`                            | yes                    |
| **Rejected**   | Owner decision against it                                   | `review.status: "rejected"`                                           | yes                    |
| **Installed**  | A local copy exists in `external/skills/<id>`               | `external/installed.json` (git-ignored)                               | **no** — machine-local |
| **Verified**   | An agent was shown to discover/use it for a consumer        | `registry/consumers.json` assignment `verification`                   | yes                    |

`registry/skills.json` remains the single source of truth for metadata. Installation state is deliberately not
published.

**Status after ES6:** 25 external skills reviewed. **4 approved and pilot-verified**: `grilling`,
`writing-plans`, `verification-before-completion` and `frontend-design`. `grill-me` was classified redundant and not
approved. Installs exist only on the machine that ran the pilot. **No project or global activation exists.**

Agent evidence lives in `registry/evidence.json` and is published in the catalog. One record per
skill × agent run, with the agent version, pinned revision, content hash, and a pass/fail for discovery,
instructions and invocation. It is separate from consumer verification.

## 1. Discovery

Method used in ES4 (repeatable):

1. Find candidate repositories (web search for leads; third-party catalogs are leads only, never sources of truth).
2. Confirm the repository exists and get its HEAD commit: `git ls-remote --symref https://github.com/<owner>/<repo> HEAD`.
3. Confirm owner, license and fork status: `GET https://api.github.com/repos/<owner>/<repo>` (`owner.type`,
   `license.spdx_id`, `fork`, `archived`). Unauthenticated limit: 60 requests/hour.
4. Download the tarball **at the pinned SHA** (`https://codeload.github.com/<owner>/<repo>/tar.gz/<sha>`) into a fresh
   untrusted directory, list `SKILL.md` folders, and shortlist by category.
5. Read per-skill licence files where the repository has none at the root.

Sources examined (all original repositories, `fork: false`, not archived, at the SHAs in the registry):
`anthropics/skills`, `obra/superpowers`, `mattpocock/skills`, `vercel-labs/agent-skills`, `antfu/skills`,
`vuejs-ai/skills`, `trailofbits/skills`, `CloudAI-X/threejs-skills`, `Community-Access/accessibility-agents`,
`supabase/agent-skills`, `openai/skills`, `expo/skills` (examined; nothing shortlisted, React Native is not an ES4
category).

**Gaps — no credible upstream found:** Phaser, Blender, SVG illustration, and a dedicated API-design skill. They are
not registered. (Momee's first-party `momee-character-art` covers SVG character work.)

## 2. Source verification

Enforced by schema and installer:

- `source.upstream.url` is the original repository; a fork, if ever used, goes in `source.fork` and must differ.
- `source.revision` must be a full 40-character commit SHA. Tags and branches are rejected because they move.
- `source.path` must be a relative path with no `..`, `.`, empty segments, absolute or Windows forms.
- The installer accepts only `https://github.com/<owner>/<repo>` sources and checks that the archive's top folder is
  `<repo>-<sha>`, i.e. GitHub served the requested commit.
- `review.contentHash` (`sha256-…`) is a hash over every file path, exec bit and file content in the skill folder.
  Installation fails unless the downloaded folder hashes to exactly the reviewed value.

## 3. Security review

```sh
pnpm skills:review <id>            # download pinned revision to external/.review/<id>@<sha>/ and scan
pnpm skills:review -- --dir <path> # scan an existing local folder
```

The scan (`packages/catalog/src/review.ts`) reads files as text and reports: scripts (by extension, exec bit or
shebang), binaries, symlinks, and pattern hits in these categories:

| Category     | Looks for                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------- |
| network      | curl/wget/fetch/requests, package installs, git clone/pull                                    |
| shell        | pipe-to-shell, eval/exec/child_process/subprocess, sudo/rm -rf/force-push                     |
| filesystem   | file writes, home and agent-config paths (`~/.claude/settings`, `~/.codex/config`, `.ssh`, …) |
| credentials  | API keys, tokens, secrets, `process.env`/`os.environ`                                         |
| instructions | override/concealment wording, auto-run wording, **remote instructions fetched at run time**   |
| hidden       | bidi/zero-width characters, HTML comments, long base64-like blobs                             |

A hit is a pointer for the human reviewer, not a verdict. Each hit is checked by reading the surrounding lines, and
the conclusion goes into `review.findings`. In ES4 the reviewer read every flagged location and each skill's entry
point; it was **not** a line-by-line audit of all files. That is stated in each entry's `reviewer` field.

Notable ES4 findings:

| Skill                                       | Finding                                                                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web-design-guidelines`                     | **High.** Fetches its actual rules from an unpinned `main` URL on every run, so pinning does not pin behaviour. Recommend reject, or a first-party fork that vendors the guidelines.               |
| `mcp-builder`, `claude-api`                 | Medium. Load unpinned SDK/API docs at run time; mcp-builder's eval scripts call the Anthropic API with an env key.                                                                                 |
| `brainstorming`                             | Medium if its optional visual companion is used: a bundled local HTTP/WebSocket server (127.0.0.1 by default), background process, `exec` of `BRAINSTORM_OPEN_CMD`. Forceful auto-trigger wording. |
| `systematic-debugging`                      | `find-polluter.sh` runs `npm test` per test file when used.                                                                                                                                        |
| `doc-coauthoring`                           | **No licence found** (no skill or repo licence). Do not install or redistribute until upstream states one.                                                                                         |
| `differential-review`                       | CC-BY-SA-4.0 share-alike applies to any modified copy.                                                                                                                                             |
| `grill-me`, `improve-codebase-architecture` | Hard dependencies on other skills (`requiresSkills`), all registered and reviewed.                                                                                                                 |

Full per-skill findings are in the registry and on the website's skill pages.

## 4. Approval (owner only)

Approval is never automated. To approve, the owner edits the skill's `review`:

```json
"review": { "status": "approved", "approvedBy": "<owner>", "reviewedAt": "...", "reviewer": "...",
            "revision": "<same as source.revision>", "contentHash": "sha256-...", "findings": [ ... ] }
```

Validation rejects an approval without `approvedBy`, without a matching `revision`/`contentHash`, or whose
`requiresSkills` are not approved too.

## 5. Installation

```sh
pnpm skills:install <id>             # approved skills only; downloads the pinned SHA, verifies, installs
pnpm skills:install <id> -- --replace  # move to a newly approved revision; previous copy kept as a backup
pnpm skills:status                   # installed / modified / missing, and drift from the registry pin
pnpm skills:rollback <id>            # restore the most recent backup (itself reversible)
pnpm skills:uninstall <id>           # move the install to backups; never deletes
```

Guarantees (each covered by `packages/catalog/test/install.test.ts`):

- Refuses anything not `approved` for the pinned revision.
- Downloads with HTTPS `fetch` into `external/.staging/`. No shell pipes, no package managers, no post-install
  hooks. Only `tar` runs, to extract the one requested folder.
- Rejects archives without the folder at that revision, folders containing symlinks or special files, and content
  whose hash differs from the review.
- Never overwrites silently: same revision is a no-op; a different revision needs `--replace`; locally modified
  installs and untracked folders are refused.
- Failed downloads leave no files behind.
- Backups live in `external/.backups/<id>/` with a sidecar JSON holding the full lock entry, so rollback restores
  the exact revision and hash.

Installed content stays git-ignored (`/external/*`).

## 6. Updating

1. Change `source.revision` to the new SHA. Validation fails ("re-review") because the review covers the old SHA.
2. `pnpm skills:review <id>`, read the diff against the previous review, update `revision`, `contentHash` and
   `findings`; status goes back to `reviewed`.
3. Owner re-approves. `pnpm skills:install <id> -- --replace`.
4. Consumers verified at the old revision now show **stale** on the website. Re-verify them.

## 7. Consumer activation

Installation and activation are separate. To activate an installed skill for a project, create relative symlinks
using the conventions verified in ES2 (`docs/agent-compatibility.md`):

```sh
# in the consumer repository
ln -s <relative path to>/ecosystem-skills/external/skills/<id> .claude/skills/<id>   # Claude Code
ln -s <relative path to>/ecosystem-skills/external/skills/<id> .agents/skills/<id>   # Codex
```

Because `external/skills/` is git-ignored, these links are machine-local and should not be committed in the consumer.

Compute each link target with `relpath(realpath(external/skills/<id>), realpath(<link dir>))`, never overwrite an
existing entry, and check with `pnpm skills:links <project-dir> <id…>` (it resolves external skills against
`external/skills/<id>`, and exits non-zero if nothing was checked). Evidence that a link works is a real agent run,
not the link checker.

**Rollback:** `unlink <project>/.claude/skills/<id> <project>/.agents/skills/<id>` removes only the links. The
managed install and its backups are untouched; set the assignment back to unverified or remove it.
Then add an assignment in `registry/consumers.json` (`verification: unverified`), test with real agents, and record
`verified` with `verifiedAt`, `method` and the `revision` that was verified. Global activation (`~/.claude/skills`,
`~/.agents/skills`) is untested and out of scope.

## 8. Licensing

- **MIT / Apache-2.0:** local installs are fine. Any copy or fork must keep the licence text and notices; the
  Anthropic and OpenAI skills ship a per-skill `LICENSE.txt`, which the installer keeps because it installs the
  whole folder.
- **Vercel skills:** the repository has no LICENSE file; MIT is stated in the README and in two skills' frontmatter.
  Recorded as MIT with that caveat in findings.
- **CC-BY-SA-4.0 (Trail of Bits):** attribution required; modified versions must use the same licence.
- **Unknown (`doc-coauthoring`):** no grant found. Default copyright applies; do not install, fork or redistribute.
- This repository publishes metadata about external skills, not their content. Installs are local copies.

## 9. ES6 pilot (2026-10-26)

### Procedure

1. **Recheck.** Upstream HEADs were unchanged since ES4. A fresh `pnpm skills:review <id>` download at each pin
   reproduced the reviewed content hash. Every file of the five candidates was read in full, as data.
2. **Decide.** `grilling`, `writing-plans`, `verification-before-completion` and `frontend-design` were eligible.
   `grill-me` was **redundant**: a two-line, user-invoked pointer to `grilling` that references a "Skill tool"
   Codex does not have. It stays `reviewed`, not approved.
3. **Approve** the four (`approvedBy`: owner, ES6 pilot authorization). None has `requiresSkills`, so dependency
   closure holds.
4. **Install:** `pnpm skills:install <id>` for each. All four installed at the pinned SHAs with matching hashes. A
   reinstall was a no-op. `grill-me` was refused (not approved).
5. **Expose** the installs to a disposable, git-initialised consumer outside every project. Each skill got relative
   symlinks in `.claude/skills/<id>` and `.agents/skills/<id>`. `pnpm skills:links <consumer> <ids…>` reported
   `linked` for both agents.
6. **Run real agents** in that consumer, giving each skill a harmless, skill-specific task with a marker that only
   appears if the skill's instructions were followed. Tools were restricted per task: no Bash/Edit/Write where not
   needed, and only the fixture's own check command for the verification test. Codex used its read-only sandbox,
   or workspace-write only for `writing-plans`, which saves a file into the consumer.
7. **Record** the results in `registry/evidence.json`. The disposable consumer is not registered as a consumer.
   After verifying its identity, it was deleted.

### Results

| Skill                            | Claude Code 2.1.310 | Codex CLI 0.164.0 | Marker checked                                                               |
| -------------------------------- | ------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `grilling`                       | verified            | verified          | `❓ Qn … ➡️` rounds; stops after one round                                   |
| `writing-plans`                  | verified            | verified          | plan saved to `docs/superpowers/plans/` with the skill's header and sections |
| `verification-before-completion` | verified            | verified          | ran the failing check first and refused to claim completion                  |
| `frontend-design`                | verified            | verified          | named hex palette, type roles, ASCII layout, review against defaults         |

Discovery: both agents listed all four exactly once. `grill-me` was absent, and nothing collided with built-in or
global skills. Instruction loading: Claude loaded each via the Skill tool from the consumer's `.claude/skills`
link; Codex read each `SKILL.md` through `.agents/skills`.

Observation: Codex's `frontend-design` palette stayed close to the cream/clay look the skill calls a default,
though it gave a reason. Functional, but the result quality is a judgement call.

### Lessons and limitations

- **Do not start several `codex` processes at once.** On startup Codex refreshes its bundled system skills in
  `~/.codex/skills/.system`. Four parallel runs raced and left that folder incomplete. A single sequential Codex
  run reinstalled all five system skills, so the folder is back to its original contents. Run Codex tests
  sequentially.
- The pilot ran on one machine and one model per agent, with one run per skill × agent. LLM behaviour varies.
- Implicit (description-based) triggering was not tested. Every test named the skill.
- MIT skills install without the repository-root LICENSE (it is outside the skill folder). This is fine for a
  private local install. Any redistribution or fork must add the upstream copyright notice.
- Activation into a real project is still a separate, unperformed step (section 7).

## 10. ES7: real-project activation (ecosystem-skills itself, 2026-10-26)

`grilling` and `verification-before-completion` are linked (relative symlinks, both agent folders) into this
repository and assigned to the existing `ecosystem-skills` consumer. Nothing else was activated. A verified backup of
the repository was taken first (outside the repo, with a SHA-256).

**Natural triggering** (prompts did not name the skill; one run per cell; control = same prompt without the skill):

|                                                                                               | Claude Code 2.1.310                                                                                              | Codex 0.164.0            |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `grilling` — "help me figure out what a collections feature should do"                        | **Invoked it unprompted**; read the repo, asked numbered questions with recommended answers, implemented nothing | Not tested (usage limit) |
| `verification-before-completion` — "write a small function + test, tell me what you verified" | **Listed but not invoked** in this run; behaviour was still evidence-based                                       | Not tested (usage limit) |

Control observations: without the skills, Claude Code still asked clarifying questions (without the skill's round
format) and still ran its tests and said what it had not checked. So good default behaviour overlaps with both skills,
and one run each cannot show the skills _caused_ an improvement. In the verification run with the skill available the
agent also proved its tests could fail via a temporary mutation; this may reflect the skill's presence, but is not
established.

Agent differences: Codex was not run, so no comparison exists. Its explicit-invocation results are in section 9.

Evidence records `es7-*` carry `trigger: "natural"` (absent means explicit) and a `control` note. They are additions;
the ES6 records are unchanged. `verification-before-completion` is recorded `partial` (discovery passed, natural
invocation failed in this run). The consumer assignments stay `unverified` because verification is per assignment and
Codex is untested here.

Limitations: one Claude Code run per prompt; control runs used different repository contexts (an empty repo for the
grilling control); Codex deferred. Note that Codex may change its bundled `~/.codex/skills/.system` set on startup
(`review-agent` was replaced by `plugin-creator` between runs); it stayed at five complete skills and was not touched.

## 11. ES8: trigger reliability evaluation (2026-10-26)

Natural triggering is **probabilistic**: it depends on the prompt, the agent and its version, and what else is in the
environment. This evaluation does not prove a general improvement from either skill.

### Method

- **Two separate dimensions.** _Invocation_ (`invoked` / `not-invoked` / `uncertain` / `not-tested`) is decided only from
  load evidence in the agent trace: a Skill-tool call or a read of the skill's `SKILL.md`. _Behavior_
  (`passed` / `partial` / `failed` / `not-tested`) is judged separately by a coarse rubric. Good behavior never counts as
  an invocation.
- **Six scenarios**, prompts never name a skill (`packages/catalog/evals/scenarios.ts`):

| ID  | Skill                          | Prompt in one line                             | Fixture            | Behavior rubric (pass)                                                |
| --- | ------------------------------ | ---------------------------------------------- | ------------------ | --------------------------------------------------------------------- |
| G1  | grilling                       | Clarify a "skill collections" feature          | `skillbox`         | ≥3 questions, no files changed, no implementation                     |
| G2  | grilling                       | Offline + real-time sync + no server/P2P       | `skillbox`         | as G1, and names the conflict                                         |
| G3  | grilling                       | Central assignments file vs per-project config | `skillbox`         | as G1, and discusses trade-offs                                       |
| V1  | verification-before-completion | Fix a slugify bug and confirm it works         | `slug-bug`         | tests pass in the final workspace and were re-run after the last edit |
| V2  | verification-before-completion | Is the stats module complete? (a test fails)   | `stats-incomplete` | ran the test, no completion claim, no edits                           |
| V3  | verification-before-completion | "Can you confirm this is ready?" (all passes)  | `calc-complete`    | ran the tests, reports what was verified, no edits                    |

- **Treatment vs control.** The same deterministic fixture (`packages/catalog/evals/fixtures.ts`) is built in a fresh
  disposable git repo per run. Treatment links only the tested skill into `.claude/skills` and `.agents/skills`
  (relative symlinks); control has no skill directories. The runner checks that no parent directory and no global
  skills directory exposes a tested skill, and flags any skill load in a control run as contamination (none occurred).
  Same prompt, tools, permissions and agent version; fresh session per run. Differences: treatment only has the skill
  listed in the agent's context.
- **Rubric limits.** Heuristics (counted questions, regexes for conflict, trade-off and completion claims, a re-run
  after the last edit). They are coarse, and one borderline call (G1 control, rep 1) was flagged by a "Step 1" phrase.
  Only a sample of the `partial` and `failed` calls (G1/G2/G3 controls, G3 treatment, V2 treatment) was read against the output; the rest rely on the rubric.
- **Repeat:** `pnpm --filter @ecosystem-skills/catalog eval --agent claude-code --out <scratch dir> --reps 2`, then
  `pnpm --filter @ecosystem-skills/catalog exec tsx evals/report.ts --out <scratch dir> --write`. Raw traces and
  workspaces stay in the scratch directory (not in the repo). The repo keeps counts only, in `evals/results/`.
- **Codex rules:** runs are sequential (the runner refuses to start if a `codex exec` is running, and uses concurrency
  1), it snapshots `~/.codex/skills/.system` before and after each run and stops if a bundled skill lacks a
  `SKILL.md`, and it stops on a usage-limit error. It never repairs Codex's files.

### Results — Claude Code 2.1.310 (24 runs: 12 treatment, 12 control; 2 per cell)

| Scenario | Loaded the skill (treatment) | Behavior pass/partial/fail (treatment) | Same (control) |
| -------- | ---------------------------- | -------------------------------------- | -------------- |
| G1       | 0/2                          | 2 / 0 / 0                              | 1 / 1 / 0      |
| G2       | 0/2                          | 2 / 0 / 0                              | 1 / 1 / 0      |
| G3       | 0/2                          | 0 / 2 / 0                              | 0 / 1 / 1      |
| V1       | 0/2                          | 2 / 0 / 0                              | 2 / 0 / 0      |
| V2       | 0/2                          | 0 / 2 / 0                              | 0 / 2 / 0      |
| V3       | **2/2**                      | 2 / 0 / 0                              | 2 / 0 / 0      |

Totals: `grilling` loaded 0/6, behavior passed 4/6 vs 2/6 in controls. `verification-before-completion` loaded 2/6
(both on the "confirm this is ready" prompt), behavior passed 4/6 vs 4/6 in controls.

### Results — Codex 0.164.0

**Deferred; not tested.** The account was still over its usage limit (reset 2026-10-27 01:53 local). One availability
check failed with the limit error and was not retried. No Codex records were written, and none of the ES8 evidence
says anything about Codex natural triggering. Run the harness once the quota resets. During the check Codex swapped
its own bundled skill (`plugin-creator` ↔ `review-agent`) at startup, as it had in ES7; this was observed, not
modified.

### Observations

- **Invocation vs behavior differ.** `grilling` was never loaded in the six treatment runs yet produced question-led
  answers in 4 of them. Controls did so in 2 of 6. Because the treatment agent had the skill listed in its context,
  this could be a context effect, noise, or chance; with 2 runs per cell it is not established.
- **`grilling` loaded in ES7 but not here.** The same G1 prompt loaded it once in the real repository (ES7, one run)
  and 0 of 2 times in the fixture. The environments differ (repo size, number of skills in context), so this is a
  reminder that triggering varies, not a contradiction.
- **`verification-before-completion` triggered on an explicit confirmation request ("can you confirm this is
  ready?")** and not on "fix it and confirm" or "is it complete?". In V2 neither condition ran the failing test: the
  agent read the code and asserted it would fail. The answer was correct; the skill's "run it fresh" rule was not
  followed in either condition.
- **Friction** was only observed, not measured. No treatment run failed or scored below its control on the rubric.
  Both V3 treatment runs (where the skill loaded) hit one permission denial each (a compound shell command that the
  narrow allow-list refused; the controls had none) and ran the tests three times against two in the controls. In an
  interactive session that denial would be a prompt. No other run had a denial.

### Recommendations (interpretation)

| Skill                            | Recommendation                | Why                                                                                                                                            |
| -------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `grilling`                       | **Keep active provisionally** | Instruction-only, no side effects, explicit use works on both agents (ES6). Natural triggering is unreliable here (0/6) and Codex is untested. |
| `verification-before-completion` | **Keep active provisionally** | Same safety profile; it triggers on confirmation requests (2/2) but not on the other two prompt styles; no harm seen; Codex untested.          |

Do not edit the skills' descriptions to raise invocation rates. If a change looks useful (for example a description that
names "is it complete" or "check whether"), propose it as a separate, reviewed revision of the pinned skill.

### Limitations

Small samples (counts only, no percentages), one machine, one Claude model, a heuristic rubric, control and treatment
differing in whether the skill is listed in context, and Codex not run. Evidence records `es8-*` use the `trials` field
(`treatment` and `control` counts); older records have none.

### Rollback

`unlink .claude/skills/<id> .agents/skills/<id>` (symlinks only) for each of the two skills, then remove their two
assignments from `registry/consumers.json`. Nothing else depends on them. The installs in `external/skills` and the
evidence records remain.
