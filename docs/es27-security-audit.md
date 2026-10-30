# ES27 — Security audit and adoption readiness

Status: audit recorded locally (2026-11-08). **Nothing was approved, installed, assigned, committed, pushed or
deployed.** No third-party installer, hook, script or MCP server was run or connected. The approved set is unchanged
(6 skills), every curated release is still unapproved, and no consumer assignment changed.

## 1. Executive summary

The 15 skill candidates registered in ES26, the five MCP servers and the five agent toolkits / development tools were
audited by reading their source at the pinned revisions. Every subject now carries a structured, revision-pinned audit
in the registry (a small backward-compatible schema addition, §17) and on the website (§18).

- **Ready for a controlled evaluation (7):** `antislop-code`, `antislop-copywriting`, `antislop-layoutmobile`,
  `appllama-app-design-skill`, `fact-checker`, `ae-editable-project` and the local `antislop-contrast-mcp`. All seven
  are complete reviews with no critical or high finding. Five are inert instruction text; `fact-checker` is one
  fully read script, and `ae-editable-project` drives After Effects on macOS.
- **Useful after specific fixes (9):** `bots`, `stack-architect`, `gbro-collage-broll`, `antislop`, `antislop-human`,
  `directing-stickman-videos`, `claude-animation-base`, `spec-kit`, `hyperframes-framework`, plus the Google Developer
  Knowledge MCP as a manually configured connector.
- **Reference only (5):** `onetake` (noncommercial licence), `antislop-ui` (mostly duplicates `frontend-design`),
  `spec-kit-mcp` (clean but useless without Spec Kit), `gstack` and `claude-code-game-studios`.
- **Defer (3):** `appllama-usage`, `appllama-mcp` and `hyperframes-mcp-connector`: closed, paid hosted services whose
  behaviour cannot be inspected.
- **Do not adopt:** none outright. The two toolkits that would change global Claude Code configuration (`gstack`) or
  take over a project's harness (`claude-code-game-studios`) are reference-only.

Highest findings: **gstack** has two high findings (team-mode auto-update fetches and runs unreviewed code at session
start; setup adds a default-on global Stop hook), and **hyperframes-framework** has one (`hyperframes init` installs
unpinned skills globally). No critical finding was recorded. No candidate showed credential theft or deliberate
exfiltration in the code that was read.

Two ES26 records were corrected: Claude Code Game Studios registers **15** hooks (not 18), and HyperFrames CLI
telemetry is **on by default** (ES26 had "not verified").

## 2. Git baseline

| Item                         | Value                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Branch                       | `main`, level with `origin/main`                                                                              |
| HEAD at start                | `2bd73e9` "feat: secure skill distribution and add FM Ecosystem hub" (amended and pushed 14:40:54)            |
| ES26.2                       | committed: the amend at 14:40:54 contains the Resources sidebar, card links and footer                        |
| Working tree at start        | clean                                                                                                         |
| `pnpm check` at start        | passed: 396 catalog + 159 web tests, validation, lint, format, build                                          |
| Concurrent change (not ES27) | a `playground` consumer was added to `registry/consumers.json` at 14:59:15 by another process; left untouched |

Baseline counts were recalculated, not assumed: 263 skills, 76 sources, 17 resources, 6 approved skills, 6 curated
releases (all unapproved). Consumers were 17 at the start and 18 at the end because of the concurrent addition.

## 3–5. Audited subjects

Recommendation categories (audit advice, never a registry approval state): **CE** suitable for controlled evaluation,
**AR** suitable after remediation, **REF** manual/reference-only use, **DEF** defer pending more evidence, **NO** do not
adopt. Findings: C/H/M/L/I = critical/high/medium/low/info counts. Ratings are security confidence / practical
usefulness / integration complexity / maintenance burden, as judged by the reviewer from the evidence.

### Skills (15)

| Skill                       | Revision       | Review      | Rec | Findings | Ratings (sec/use/int/maint) |
| --------------------------- | -------------- | ----------- | --- | -------- | --------------------------- |
| `fact-checker`              | `97c7c6de49d1` | complete    | CE  | M2 L2 I1 | high/medium/low/low         |
| `ae-editable-project`       | `4c1902663525` | complete    | CE  | M1 L3 I2 | high/medium/medium/low      |
| `antislop-code`             | `9504989f162a` | complete    | CE  | I1       | high/medium/low/low         |
| `antislop-copywriting`      | `9504989f162a` | complete    | CE  | I1       | high/medium/low/low         |
| `antislop-layoutmobile`     | `9504989f162a` | complete    | CE  | —        | high/medium/low/low         |
| `appllama-app-design-skill` | `dd5caaec3d5d` | complete    | CE  | L1 I1    | high/low/low/low            |
| `bots`                      | `57812c1b9384` | complete    | AR  | M1 L3 I1 | high/medium/low/low         |
| `stack-architect`           | `bf60fba666ce` | complete    | AR  | L3 I1    | high/medium/low/medium      |
| `antislop`                  | `9504989f162a` | complete    | AR  | M1 L3 I1 | high/medium/medium/medium   |
| `antislop-human`            | `9504989f162a` | complete    | AR  | M1 L1 I1 | high/medium/low/low         |
| `gbro-collage-broll`        | `a1a4ee2e2abf` | complete    | AR  | M3 L3 I1 | medium/low/high/medium      |
| `directing-stickman-videos` | `eb4bb378c471` | **partial** | AR  | M2 L4 I2 | medium/medium/high/high     |
| `antislop-ui`               | `9504989f162a` | complete    | REF | L2       | high/low/low/low            |
| `onetake`                   | `abb6d17279cd` | **partial** | REF | M3 L2 I2 | medium/medium/high/high     |
| `appllama-usage`            | `dd5caaec3d5d` | complete    | DEF | M3 L1    | low/low/medium/medium       |

### MCP servers (5)

| Resource                         | Operation       | Review   | Rec | Findings | Key fact                                                                        |
| -------------------------------- | --------------- | -------- | --- | -------- | ------------------------------------------------------------------------------- |
| `antislop-contrast-mcp`          | local, stdio    | complete | CE  | L2       | Pure stdlib WCAG contrast arithmetic; no network, no auth, no data access       |
| `spec-kit-mcp`                   | local, stdio    | complete | REF | L2       | 7 read-only tools; clean, but only useful with Spec Kit itself                  |
| `google-developer-knowledge-mcp` | remote, HTTP    | partial  | AR  | M3 L2 I1 | Google docs search; API key in a header (the fallback skill puts it in the URL) |
| `appllama-mcp`                   | remote, HTTP    | partial  | DEF | M2 L1    | Closed, paid per call; tool results treated as instructions by its skill        |
| `hyperframes-mcp-connector`      | remote (hosted) | partial  | DEF | M2 I1    | Beta; tool list, OAuth scopes, retention and pricing undocumented               |

### Agent toolkits and development tools (5)

| Resource                   | Review   | Rec | Findings    | Key fact                                                                                     |
| -------------------------- | -------- | --- | ----------- | -------------------------------------------------------------------------------------------- |
| `claude-animation-base`    | complete | AR  | M2 L1 I1    | Small, readable; render browser has local-file access; Clawd mascot likeness                 |
| `spec-kit`                 | partial  | AR  | M3 L2 I1    | Init stays in the project; extensions can add auto-running hooks; optional checksums         |
| `hyperframes-framework`    | partial  | AR  | H1 M2 L1    | `init` installs unpinned skills globally; telemetry on by default; silent self-update        |
| `claude-code-game-studios` | partial  | REF | M1 L5 I1    | 15 hooks + status line auto-run; one daily GitHub update check; no global config changes     |
| `gstack`                   | partial  | REF | H2 M7 L3 I1 | Global Stop hook; team auto-update runs fetched code; real logged-in browser; CLAUDE.md rule |

## 6. Review methodology

- **Source.** Each repository was downloaded once from `codeload.github.com` at its pinned commit (a tarball, never a
  clone with hooks), extracted into its own empty scratch directory, and the top folder name was checked against the
  full SHA. All 15 matched. Each candidate skill folder was hashed with this repository's `tree.ts`: all 15 hashes
  equal the `discovery.contentHash` recorded in ES26, so the audit covers exactly the registered content.
- **Static scan first.** The repository's heuristic scanner (`review.ts`) was run over each skill folder as a pointer
  to where to look. Its hits are not findings by themselves.
- **Manual read.** Five read-only reviewers worked in parallel from one written brief (scope, the 13 review categories ×
  instructions/supporting-files, severity scale, recommendation scale, evidence format). They could not execute
  anything, use the web or contact an MCP endpoint. Every finding cites a repository-relative path and line at the
  pinned revision.
- **Verification of the reviewers.** Their key evidence was re-checked directly against the sources (for example the
  `factcheck.py:51` code points, `gbro` `SKILL.md:35`, `run_in_ae.sh:14`, the Anti-Slop plugin manifest and launcher,
  `antislop-human` `allowed-tools`, the Appllama `.mcp.json`). Every spot check matched.
- **Tiers.** Each skill was classified as inert text, instructions that request actions, bundled code, automatic
  hooks and/or hosted services. A harmless-looking `SKILL.md` was never treated as safe without following its
  references and scripts.
- **Documented vs inspected.** For hosted services (Appllama, HyperFrames connector, Google Developer Knowledge) only
  the client configuration and documentation exist to read; their audits are marked partial and say so.
- **Completeness.** "Complete" means everything in scope was read at the pinned revision (for skills: all 26 checks
  evaluated). Large repositories (gstack, Game Studios, Spec Kit, HyperFrames) and the two skills with very large
  instruction surfaces (OneTake, Stickman) are honestly marked partial, with the unread parts named in each audit.

## 7. Source revisions

| Source                               | Repository                                 | Revision (full)                            |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| `frontendsupply-bots`                | frontendsupply/bots                        | `57812c1b9384758f744b5a3f6087a32c78331d2e` |
| `anmolchandiok-claude-after-effects` | AnmolChandiok/claude-after-effects-skill   | `4c19026635250bfe5d742c116786a4d2b7e67254` |
| `brickystudios-ai-fact-checker`      | BrickyStudios/ai-fact-checker-claude-skill | `97c7c6de49d1429b55bed552d05a92a88e884954` |
| `marwanashraf22-stack-architect`     | MarwanAshraf22/stack-architect             | `bf60fba666ce3290cc36769240000d01a316269f` |
| `feitangyuan-onetake`                | feitangyuan/OneTake                        | `abb6d17279cdc749e27e99aa534a062d8fd01ced` |
| `pyang5166-gbro-collage-broll`       | pyang5166/gbro-collage-broll               | `a1a4ee2e2abf7d44e460026b706d0c72c2cf8a91` |
| `anti-slop-unresolved`               | miqdadbadjuber/anti-slop                   | `9504989f162a92b1996853eccbb3d8a86e73df68` |
| `kaomei-stickman-video-director`     | kaomei/stickman-video-director             | `eb4bb378c4716a617f9ad7d98a60379b9d1fa54a` |
| `appllama-skills`                    | Appllama/appllama-skills                   | `dd5caaec3d5d50ad7fc0324da238119c6b7c3707` |
| `google-skills`                      | google/skills                              | `2194d3b8b1f31975fef2f1a0ae6b9ab55bd7ceee` |
| `heygen-hyperframes`                 | heygen-com/hyperframes                     | `4e2a1c215a42c6d262b8c635df9d5edff80e8830` |
| `github-spec-kit`                    | github/spec-kit                            | `c43849408ac0de2ca6a52f14eaae71449776057b` |
| `garrytan-gstack`                    | garrytan/gstack                            | `d479c5bf1efed979297dc4498c60aef7b67aa639` |
| `donchitos-claude-code-game-studios` | Donchitos/Claude-Code-Game-Studios         | `05ad7c8a5b8aa2aa86bbd3439ae7cf7295cac418` |
| `claude-animation-base`              | JohnHeibel/ClaudeAnimationBase             | `0ac8bf2b31942376cb6b8c4074715595d512acd2` |

HyperFrames and gstack have moved upstream since ES26; their audits, like their registry records, stay on the pinned
commits above.

## 8. Security findings and evidence (highest first)

The complete list, with evidence, exposure and mitigation for every finding, is in the registry (`review.audit` on
each skill, `security.audit` on each resource) and on each skill and resource page. The most important:

| Sev    | Subject                                    | Finding                                                                                               | Evidence (pinned revision)                                                     |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| High   | `gstack`                                   | Team-mode auto-update fetches `stable` and runs `./setup`, unverified, hourly                         | `bin/gstack-session-update:75,439,577`; `setup:4424-4434`                      |
| High   | `gstack`                                   | Default-on global Stop hook in `~/.claude/settings.json`                                              | `setup:4874ff`; `hosts/claude/hooks/timeline-stop-hook`                        |
| High   | `hyperframes-framework`                    | `hyperframes init` installs unpinned skills globally into other agents' dirs                          | `packages/cli/src/commands/skills.ts:112-120`; `init.ts:1201-1202`             |
| Medium | `gstack`                                   | Install prompt adds "Never use mcp\_\_claude-in-chrome\_\_\* tools" to CLAUDE.md                      | `README.md:38,309`                                                             |
| Medium | `gstack`                                   | Browser skills use the real logged-in browser; cookie import via Keychain                             | `browse/SKILL.md:149`; `browse/src/cookie-import-browser.ts:590`               |
| Medium | `gstack`                                   | Outside reviews send code to OpenAI/Anthropic by default                                              | `bin/gstack-config:340`                                                        |
| Medium | `hyperframes-framework`                    | CLI telemetry on by default; email linked after sign-in                                               | `packages/cli/src/telemetry/config.ts:622-623`; `auth/telemetryIdentity.ts:33` |
| Medium | `spec-kit`                                 | Extensions can add native auto-running agent hooks; digests optional                                  | `src/specify_cli/integrations/claude/__init__.py:66`; `shared_infra.py:60`     |
| Medium | `claude-code-game-studios`                 | 15 hooks run bundled shell/Python on almost every tool call                                           | `.claude/settings.json:150-293`                                                |
| Medium | `gbro-collage-broll`                       | Tells the agent to write the Gemini key into `~/.zshrc`; paid batch generation without a final prompt | `SKILL.md:35`, `SKILL.md:86-92`                                                |
| Medium | `antislop`                                 | Claims precedence over other skills, "Load always", blocking mode question                            | `skills/antislop/SKILL.md:3,47`                                                |
| Medium | `antislop-human`                           | `allowed-tools: Bash(python *) Bash(python3 *)` pre-approves any Python                               | `skills/antislop-human/SKILL.md:4`                                             |
| Medium | `fact-checker`                             | PDF libraries resolved unpinned from PyPI on every run; fetches any URL                               | `scripts/factcheck.py:2-5,216-224`                                             |
| Medium | `appllama-usage`                           | "Errors are instructions": remote tool output promoted to instructions                                | `skills/appllama-usage/SKILL.md:45`                                            |
| Medium | `ae-editable-project`                      | Runs generated ExtendScript in After Effects; needs AE's file/network scripting preference            | `scripts/run_in_ae.sh:14`; `SKILL.md:85`                                       |
| Medium | `directing-stickman-videos`                | Agent drives the user's logged-in paid accounts; affiliate-tagged third-party MCP                     | `references/amber-noir.md:15,45`                                               |
| Medium | `claude-animation-base`                    | Render browser has local-file access and network while running agent-written JS                       | `render.mjs:64-67`; `studio.html:6`                                            |
| Medium | `bots`, `onetake`, `claude-animation-base` | Reproduces famous/brand characters or a mascot likeness                                               | `SKILL.md:26-30`; `references/3d.md:139-158`; `ANIMATION_GUIDE.md`             |

The `fact-checker` scanner hit for "invisible / bidi unicode" at `scripts/factcheck.py:51` was examined: the characters
are U+00AD, U+200B, U+200C, U+200D and U+FEFF used as literals inside a regex that strips them. They are not bidi
controls and do not change behaviour (low; rewrite as escapes). No bidi control was found in any audited repository.

## 9. Compatibility matrix

| Candidate                                          | Claude Code                                        | Codex                          | Project-local   | Shell    | Network     | Credentials / account    | Adaptation |
| -------------------------------------------------- | -------------------------------------------------- | ------------------------------ | --------------- | -------- | ----------- | ------------------------ | ---------- |
| `antislop-code` / `-copywriting` / `-layoutmobile` | folder skill                                       | folder skill                   | yes             | no       | no          | none                     | no         |
| `antislop` / `antislop-human`                      | folder skill (not the plugin)                      | folder skill                   | yes             | yes      | no          | none                     | fork first |
| `antislop-ui`                                      | folder skill                                       | folder skill                   | yes             | no       | no          | none                     | no         |
| `fact-checker`                                     | native                                             | generic, untested              | yes             | yes      | yes         | none                     | no         |
| `ae-editable-project`                              | native (macOS + After Effects)                     | generic, untested              | yes             | yes      | no          | After Effects licence    | no         |
| `bots`                                             | native                                             | metadata only, untested        | after curation  | yes      | optional    | none                     | curate     |
| `stack-architect`                                  | native                                             | should work, untested          | after curation  | optional | optional    | none                     | curate     |
| `appllama-app-design-skill`                        | folder skill                                       | folder skill                   | yes             | yes      | no          | none (paid MCP optional) | no         |
| `appllama-usage`                                   | needs the remote MCP                               | needs the remote MCP           | yes             | no       | yes         | paid Appllama Pro        | —          |
| `gbro-collage-broll`                               | partial (Gate 2 needs Codex image_gen)             | primary target                 | no (home paths) | yes      | yes         | paid Gemini key          | yes        |
| `onetake`                                          | personal skill                                     | untested                       | no              | yes      | yes         | none; noncommercial only | yes        |
| `directing-stickman-videos`                        | Director mode as text; Autopilot needs node/ffmpeg | author's preferred target      | yes             | yes      | yes         | TTS/image API keys       | yes        |
| `antislop-contrast-mcp`                            | manual stdio entry                                 | manual stdio entry             | yes             | yes      | no          | none                     | no         |
| `spec-kit` (+ MCP)                                 | project-local `.claude/skills`                     | project-local `.agents/skills` | yes             | yes      | init: no    | none                     | no         |
| `google-developer-knowledge-mcp`                   | manual connector                                   | manual `config.toml` entry     | yes             | no       | yes         | Google API key           | no         |
| `claude-animation-base`                            | plain repo + guide                                 | likely, untested               | yes             | yes      | fonts       | none                     | no         |
| `claude-code-game-studios`                         | native template (takes over `.claude/`)            | not compatible as shipped      | yes             | yes      | daily check | none                     | heavy      |
| `gstack`                                           | global install + global hooks                      | experimental host              | **no**          | yes      | yes         | many optional            | —          |
| `hyperframes-framework`                            | with `--skip-skills`                               | with `--skip-skills`           | only with flags | yes      | telemetry   | HeyGen optional          | flags      |

"Untested" means no agent run was performed; compatibility is from the files, not from evidence.

## 10. Overlap with existing approved skills

| Approved skill                   | Overlapping candidates                                                                                                                                             | Recommendation                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-design`                | `antislop` (high, with conflicting palette/precedence rules), `antislop-ui` (high), `appllama-app-design-skill` "anti-slop laws", `antislop-copywriting` (partial) | Keep `frontend-design` as the aesthetic skill. Do not add `antislop-ui`. If Anti-Slop is evaluated, use the narrow skills (code, copywriting, layoutmobile, a forked human) and reconcile or drop the core's conflicting rules. |
| `writing-plans`                  | `stack-architect` (same "before touching code" trigger), gstack/Game Studios planning skills                                                                       | Keep separate only if `stack-architect`'s trigger is narrowed to stack choice and its house defaults removed.                                                                                                                   |
| `grilling`                       | `stack-architect` question rounds; gstack `/office-hours`                                                                                                          | No consolidation needed; `grilling` stays the general interrogation skill.                                                                                                                                                      |
| `verification-before-completion` | `fact-checker` (same philosophy, documents rather than code); Game Studios QA gates                                                                                | Retain both: `fact-checker` verifies prose and sources, not code completion.                                                                                                                                                    |

No candidate is a pure duplicate of an approved skill except `antislop-ui`, recommended reference-only for that
reason. The approved skills were not modified.

## 11. Licence and usage restrictions

- **`onetake`: PolyForm Noncommercial 1.0.0.** No commercial or client use; a commercial licence is sold separately.
  This blocks it for any revenue-earning project regardless of security.
- **Brand and likeness:** `bots` §0 instructs faithful reproduction of famous characters and brands;
  `claude-animation-base`'s Clawd is an explicit Claude Code mascot likeness; `onetake` case notes model real products.
  MIT does not grant third-party trademark or likeness rights.
- **Trademarks:** Appllama name and logo are excluded from its MIT licence (`README.md:131-133`).
- **Third-party content:** `antislop-human` and `antislop-ui` references derive from Addy Osmani's web-quality-skills
  (MIT, notice shipped). `directing-stickman-videos` bundles OFL-1.1 fonts.
- **Hosted services:** Appllama MCP, HyperFrames connector and Google Developer Knowledge publish no licence for the
  service; their terms of service were not reviewed.
- **Everything else:** MIT or Apache-2.0 as recorded, with no extra restrictions found.

## 12. Third-party network and credential risks

| Subject                           | Destinations                                                                               | Credentials                                            | Cost                  |
| --------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------- |
| `fact-checker`                    | web search; any URL in the document; PyPI                                                  | none                                                   | free                  |
| `gbro-collage-broll`              | Google Gemini API (frames uploaded); PyPI                                                  | Gemini key (README stores it in `~/.zshrc`)            | paid per generation   |
| `directing-stickman-videos`       | TTS and image APIs, Google Search, optional Renoise                                        | provider keys, logged-in browser accounts              | paid                  |
| `appllama-usage` / `appllama-mcp` | `mcp.appllama.io`                                                                          | Appllama account approval (mechanism unverified)       | paid credits per call |
| `google-developer-knowledge-mcp`  | `developerknowledge.googleapis.com`                                                        | `DEVELOPERKNOWLEDGE_API_KEY` (header; URL in fallback) | quota not verified    |
| `hyperframes-mcp-connector`       | HeyGen hosted connector                                                                    | HeyGen account / OAuth (scopes undocumented)           | plans may change      |
| `hyperframes-framework`           | PostHog telemetry (default on), npm self-update                                            | optional sign-in (email linked)                        | free CLI              |
| `gstack`                          | GitHub (updates), OpenAI/Anthropic (outside reviews), opt-in Supabase, ngrok, Hugging Face | Keychain cookie key, Supabase PAT, gh/glab             | some paid             |
| `claude-code-game-studios`        | `api.github.com` releases, at most daily                                                   | none                                                   | free                  |
| `claude-animation-base`           | Google Fonts                                                                               | none                                                   | free                  |
| `spec-kit`                        | catalogs on `raw.githubusercontent.com` (unpinned) when extensions are used                | none                                                   | free                  |

No endpoint was contacted during this audit.

## 13. Candidates suitable for controlled evaluation

These meet the bar of a complete review with no critical or high finding. They stay **unapproved** until the owner
decides; a controlled evaluation means a project-local install of a curated release in a throwaway project, explicit
invocation on Claude Code and Codex, and recorded evidence (the ES23 isolation procedure).

1. `antislop-code`, `antislop-copywriting`, `antislop-layoutmobile`: inert, self-contained text; register the folders
   only, never via `npx antislop-ai` or the plugin (which auto-starts the MCP and writes an always-on pointer).
2. `fact-checker`: pin `pdfplumber` and `pypdf` in the curated copy; prefer quick mode for confidential documents.
3. `ae-editable-project`: only if After Effects is part of the workflow; leave `examples/` and `evals/` out.
4. `appllama-app-design-skill`: as a folder skill, without the upstream plugin (which would register the paid MCP).
5. `antislop-contrast-mcp`: manual stdio registration with a pinned interpreter; marginal value next to the CLI script.

## 14. Candidates requiring remediation

| Candidate                        | Remediation before evaluation                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bots`                           | Curated skill-only folder (root SKILL.md blocker); drop WebSearch/WebFetch from `allowed-tools`; remove §0 famous characters                           |
| `stack-architect`                | Curated folder; remove the author's house defaults; narrow the trigger away from `writing-plans`                                                       |
| `antislop`                       | Fork: drop "Load always", the blocking mode question, global settings read/write, precedence claims; reconcile with `frontend-design`                  |
| `antislop-human`                 | Narrow `allowed-tools` to the contrast script                                                                                                          |
| `gbro-collage-broll`             | Project-local pinned venv; no shell rc edits; explicit cost confirmation; host check before sending the key; Claude Code image path                    |
| `directing-stickman-videos`      | Disable the logged-in browser and affiliate MCP routes; `npm ci --ignore-scripts`; declare Pillow, fonts and ffmpeg; low-quota keys; finish the review |
| `claude-animation-base`          | `npm ci`; self-host the font; drop `--allow-file-access-from-files`; replace Clawd before publishing                                                   |
| `spec-kit`                       | Pinned tag; `specify init --integration claude` with no extensions or presets; `--events false`; review generated files; finish the review             |
| `hyperframes-framework`          | Pinned CLI; `HYPERFRAMES_NO_TELEMETRY=1` and `DO_NOT_TRACK=1`; always `--skip-skills`; disable auto-update; finish the review                          |
| `google-developer-knowledge-mcp` | Manual connector only (not the plugin or marketplace), restricted key in a header, project scope; confirm the live tool list and quota                 |

The reviewer proposed "controlled evaluation" for the Google Developer Knowledge MCP; it is recorded as
"after remediation" because its server cannot be inspected (the audit is partial) and the conditions above are
remediation steps. The registry enforces that controlled evaluation needs a complete audit.

## 15. Candidates to avoid or defer

- **Reference only:** `gstack` (global hooks, unverified auto-update in team mode, global CLAUDE.md rule, skills
  unusable without the runtime), `claude-code-game-studios` (takes over the project's harness; cherry-pick templates,
  rules and agent prompts instead), `onetake` (noncommercial licence), `antislop-ui` (duplicates `frontend-design`),
  `spec-kit-mcp` (only with Spec Kit).
- **Defer:** `appllama-usage`, `appllama-mcp` (closed paid service; tool output treated as instructions; reuse rights
  of third-party app screenshots unaddressed), `hyperframes-mcp-connector` (beta; tools, scopes, retention and pricing
  undocumented; the local CLI covers the use case).

## 16. Incomplete reviews

| Subject                                                                       | Not reviewed                                                                                                                       |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `onetake`                                                                     | Large libraries (`lib/motion.js`, `ui_kit.js`, `probe.py`, `look.py`) and docs; 113 MB of media skipped                            |
| `directing-stickman-videos`                                                   | Most of ~28 reference files (~360 KB) and the prompt templates                                                                     |
| `gstack`                                                                      | ~4,900 of 5,012 files: most of `lib/` and `bin/`, settings-hook writer, update path bodies, extension, CSO native code, `bun.lock` |
| `claude-code-game-studios`                                                    | Skill and agent bodies (grep only), most docs, `studio-tests/`                                                                     |
| `spec-kit`                                                                    | ~85% of ~79k lines of Python: presets, bundles, external integration loader                                                        |
| `hyperframes-framework`                                                       | Renderer, Studio, browser telemetry; most of the ~9,450-file monorepo                                                              |
| `appllama-mcp`, `hyperframes-mcp-connector`, `google-developer-knowledge-mcp` | The hosted servers (closed); 16 Google submodule plugins absent from the tarball                                                   |

None of these is recorded as reviewed in full; on the site each shows "Review incomplete".

## 17. Registry changes

- **Schema (backward compatible).** An optional `audit` record on a skill's `review` and on a resource's `security`:
  `round`, `completeness` (`complete`/`partial`), `scope`, `recommendation` (the five categories above), `rationale`,
  `issues` (severity, title, evidence, exposure, mitigation) and `checks` (the existing 13 × 2 review checks). Resource
  audits also carry `reviewedAt`, `reviewer` and the source `revision`. No existing record changes meaning.
- **Validation.** An audit requires review status `reviewed` (or a decision) and must cover the registered revision and
  content hash; a partial audit can never back an approval; a complete skill audit must address all 26 checks with
  none "not evaluated"; controlled evaluation needs a complete audit with no critical or high finding; a resource is
  `reviewed` only with a complete audit of its pinned revision, otherwise it stays `notes-recorded`.
- **Data.** The 15 ES26 skills moved from `unreviewed` to `reviewed` (findings recorded, **no decision**), each with its
  ES27 audit. Ten resources gained audits; three are now `reviewed` (`antislop-contrast-mcp`, `spec-kit-mcp`,
  `claude-animation-base` — complete audits) and the rest remain `notes-recorded`. Concerns for gstack, Game Studios,
  AnimationBase and HyperFrames were corrected to match the audit.
- **Unchanged:** approvals (6), curated releases (6, all unapproved), consumer assignments, installation state,
  distribution and visibility, sources, approval blockers and discovery warnings.

## 18. Website changes

- Skill pages: the Review section shows the audit (completeness, recommendation labelled "not an approval", scope,
  findings by severity with evidence, and the 26 checks); the lifecycle "Reviewed" row says "Incomplete" for a partial
  audit; the stage badge in lists and headers adds "Review incomplete".
- Resource pages and cards: an audit block, a complete/incomplete badge, and the audit date and revision. The
  `notes-recorded` label now reads "Concerns noted, not fully reviewed".
- `llms.txt` explains review completeness and audit recommendations and lists both per audited item; `catalog.json` and
  `resources.v1.json` carry the audits. All strings have Indonesian translations.
- The site still shows no install, approve or connect controls, and resources are never presented as skills.

## 19. Verification results

Run on 2026-11-08 with the pinned pnpm 12.11.2, after the last change:

- `pnpm check`: exit 0. Typecheck, ESLint and Prettier clean; registry valid (263 skills, 76 sources, 17 resources,
  6 curated releases; consumers 19, including concurrent additions not made by ES27); **570 tests passed**
  (catalog 403 in 26 files, web 167 in 11 files; ES27 added 7 catalog and 8 web tests); production build succeeded.
- `git diff --check`: clean.
- Invariants checked against `HEAD`: the same 6 approved skills; `releases.json`, `sources.json`, `evidence.json`,
  `evaluations.json`, `updates.json` and `integrations.json` byte-identical; only the `review` record changed on the
  15 audited skills and only `security` on resources; no ES26 candidate assigned; `external/` (local installs)
  untouched. The built `catalog.json`, `llms.txt` and `resources.v1.json` contain no local paths.
- Browser checks (Playwright, Chromium, against `vite preview` of the production build; scripts kept outside the
  repository): ES27 suite 42/42 (audit blocks on 10 pages at 1280, 820 and 375 px in light and dark, no horizontal
  overflow, checks open from the keyboard, Indonesian, `llms.txt` and `resources.v1.json`, offline rendering from the
  service-worker cache with the not-authoritative notice); ES26.2 resources suite 82/82; ES26 regression suite
  122/123 — the one failure is a measurement artifact (the phone-only category select is hidden at desktop width and
  measures 0 px), not a defect.
- Not run: any agent evaluation, any connection to an MCP endpoint, any third-party installer or hook.

## 20. Recommended ES28 scope (for owner review)

1. Owner decisions on the seven "controlled evaluation" candidates (approve for evaluation or not).
2. For approved-for-evaluation candidates: curated releases (skill files only), security worksheet per release, and an
   isolated Claude Code + Codex explicit-invocation run recorded as evidence.
3. Fork-and-remediate the Anti-Slop core and `antislop-human`, `bots` and `stack-architect` if wanted.
4. Finish the partial reviews only where adoption is plausible: `spec-kit` (presets, bundles, loader),
   `directing-stickman-videos`, `hyperframes-framework` (with `--skip-skills`).
5. Leave `gstack`, Game Studios, OneTake and the paid hosted MCPs as reference/deferred unless a concrete need appears.
