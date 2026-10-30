# ES23 curated adoption pilot (2026-10-30)

For the owner. ES23 hardened archive extraction, corrected the accessibility release as a new version, built and verified an isolated
evaluation environment, and prepared (but did not run) the agent comparisons. Nothing was approved, installed, committed, pushed or deployed.
"Reviewed" always means "read in the stated scope", never "safe".

## 1. Baseline

ES16–ES22 is committed: `4464487 feat: expand skill discovery and add secure curated library (ES16–ES22)` (82 files, no AI trailer), and
`main` matched `origin/main` with a clean worktree. Verified at the start: 245 skills, 58 sources, 6 approved skills, 5 curated releases (all
unapproved), `pnpm check` passing with 354 tests (catalog 239, web 115). No differences from the expected state.

## 2. Archive extraction

`packages/catalog/src/archive.ts` replaces the system `tar`. The download is parsed **in memory** and every entry is checked against an
explicit policy before anything is written; the bytes that were checked are the bytes that are written (previously `tar` read the saved
archive twice, once to list and once to extract).

| Refused anywhere in the archive                                                                     | Refused inside the selected skill folder                          |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| absolute paths, drive letters, `..` segments, NUL bytes, entries outside the `<repo>-<sha>/` folder | symlinks (symlinks elsewhere in the repository are never written) |
| hard links, character and block devices, FIFOs, contiguous, sparse and unknown entry types          | backslashes, control characters, empty or `.` segments            |
| exact duplicate paths; an entry beneath a file or symlink                                           | paths that collide by case or Unicode normalisation               |
| bad header checksums, truncated entries, malformed pax records, invalid UTF-8 names                 | more than 2,000 files, a file over 10 MB, more than 50 MB total   |
| more than 200,000 entries or 512 MB decompressed; a pax commit id other than the requested one      | a path over 1,024 bytes or a segment over 255 bytes               |

Writing: a new `0700` directory, parents first, files created with `O_CREAT | O_EXCL | O_NOFOLLOW` and mode `0644`/`0755` only (no owners,
setuid bits or timestamps). The result is walked again with `lstat` and must contain exactly the expected files. Any failure removes the
whole working directory, so nothing partial is promoted. Root `LICENSE` files that are symlinks are still skipped and never read.

**Compatibility:** every pinned registry skill that is not at a repository root (240 skills in 52 repository/commit archives, downloaded
from codeload) was extracted with the new code; all 240 folder hashes equal the hashes recorded in the registry. **Tests:**
`es23-archive.test.ts` (43) with hand-built archives for every refused case, each also checking that nothing was written; a real
mid-write failure (`ENAMETOOLONG`) leaves the staging area empty. Disabling the duplicate or collision rule makes those tests fail.

## 3. `web-quality-accessibility@1.0.1`

A new, unapproved release made from the same upstream folder (`afa8da9`, `sha256-3903ee59…`); `1.0.0` is unchanged.

| ES22 finding                            | 1.0.1                                                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install @axe-core/cli -g`          | removed; "never install them globally"                                                                                                                                                         |
| unpinned `npx lighthouse`               | `npx --no -- lighthouse …` and `npx --no -- axe …` run only the project's installed copies; adding them needs the user's consent, exact versions (`lighthouse@13.5.0`, `@axe-core/cli@4.14.0`) |
| link to `../web-quality-audit/SKILL.md` | plain text naming the sibling skill; no out-of-folder reference remains                                                                                                                        |
| large text "18px / 14px bold"           | "18pt / 14pt bold", with the CSS-pixel equivalents (about 24px and 18.66px)                                                                                                                    |

Curated hash `sha256-5d7134bd…`. Modifications declared: added `LICENSE`, added `ATTRIBUTION.md`, changed `SKILL.md` (one entry listing all
four changes). Review reset, then a **full** review of the exact content (all 5 files read, 26 checks, outcome `no-blocking-issues`):
54 automated signals, of which 50 are HTML comments inside closed code fences (checked by script), one is the known password-field false
positive and one is the consent-gated install example. Accuracy notes left unchanged: two contrast figures in examples (#999 on white is about
2.8:1, not 2.5:1; #333 is about 12.6:1, not 7:1) and an error-handling snippet with an undefined variable. Install preview: blocked only by
`release-not-approved`. Note: `npx --no` refuses to download a missing package, but npm may still look up the name in the registry.

## 4. Evaluation environment

`packages/catalog/evals/es23/` (no dependencies beyond Node and Docker):

- `isolation.ts`: the exact `docker run` arguments for an agent run and a policy lint. Only a fresh copy of a synthetic fixture is mounted
  (`/work`); read-only root; non-root user; all capabilities dropped; `no-new-privileges`; 2 GB memory, 2 CPUs, 256 processes; 600 s
  wall clock; 30 agent turns as the token budget; empty `HOME` and agent config (no user settings, hooks, plugins, MCP servers or skills);
  agent telemetry and auto-update off; `npm` offline.
- `egress-proxy.mjs`: the container's only way out. HTTPS `CONNECT` to the agent's model API host only (`api.anthropic.com` or
  `api.openai.com`), everything else refused, **every attempt logged**, so unauthorized requests are observed, not assumed absent.
- `verify.ts` (`pnpm --filter @ecosystem-skills/catalog eval:es23:isolation`): starts the proxy and a probe container with exactly those
  arguments and checks from inside. **Saved result of the run on 2026-10-30, Docker 29.5.2: all 25 probes passed** (non-root, no host paths,
  only skeleton home folders, empty home, `/root` unreadable, no credential-like variables, no Docker socket, read-only root, writable
  workspace and `/tmp`, no capabilities, no-new-privileges, memory and PID limits, no direct route out, no external DNS, proxy refuses plain
  HTTP and five disallowed targets, proxy allows both model APIs with verified TLS, every refusal logged). Report:
  `evals/es23/results/isolation-2026-10-30.json`.
  _Evidence status (corrected in the ES25 audit remediation, which first recorded 24):_ this is saved historical evidence from that one run.
  `pnpm check` does not start Docker; its tests read the saved report and re-check the argument policy, the proxy decisions and the
  credential gate in code. The container probes have not been re-run since 2026-10-30.
- `tasks.ts` and `plan.ts` (`eval:es23`): 4 candidate tasks and 3 synthetic security tasks, 46 planned runs (each task × Claude Code and
  Codex × arm A without the skill and arm B with the release), identical prompt, fixture, budget and criteria per arm, and the live gate.

**Live evaluation was not run.** Isolation is available and was verified once (2026-10-30, saved report above), but the remaining requirement cannot be met with what is on this
machine: the only model credentials are the owner's personal logins (the Claude Code login in the macOS keychain and the Codex ChatGPT login
in `~/.codex/auth.json`). Placing either inside a sandbox that is then given adversarial instructions would expose a personal credential,
which ES23 forbids. The gate refuses until there is:

1. a dedicated, revocable, spend-limited API key per agent, in a `chmod 600` file named by `ES23_EVAL_ANTHROPIC_KEY_FILE` /
   `ES23_EVAL_OPENAI_KEY_FILE` (personal credential locations are refused; since the ES25 audit remediation by their real path, so a
   symlinked folder, a symlinked file or a second hard link cannot reach one. The read is bound to one file: the key file is opened
   first (not through a symlink as its last component) and then the path must still pass every rule and still name exactly the opened
   file (same device and inode, a single link), so a folder swapped before or after the open is refused and nothing is returned. Node
   has no `openat()`, so this re-validation stands in for descriptor-relative access; where `O_NOFOLLOW` is missing (Windows) reading
   fails closed. A process running as the owner that moves the owner's own credential file into the validated location is out of
   scope. Before these fixes the check was lexical; no key file was ever configured, so no personal credential was read),
2. an evaluation image with pinned `claude` and `codex` CLIs (not built: building it installs packages, which waits for authorization),
3. the owner's authorization of the runs and their cost.

## 5. Claude Code results

No ES23 run. Earlier evidence (ES6–ES8, weaker isolation: ordinary disposable repositories, owner's account) exists only for `grilling`, on
the same upstream content as `grilling@1.0.0`: explicit invocation verified (Claude Code 2.1.310); one unprompted invocation on a real
project (ES7); in ES8 the skill loaded in 0 of 6 treatment runs. Treatment runs scored better than controls on the coarse rubric, but since
the skill never loaded in them the difference cannot be attributed to it. Nothing for the GSAP releases or `web-quality-accessibility`.

## 6. Codex results

No ES23 run. Earlier evidence for `grilling` only (Codex 0.164.0): explicit invocation verified; in ES8 the skill loaded in 0 of 6 treatment
runs, and controls passed at least as often.

## 7. Security behaviour

Not observed: no agent was run. Prepared, synthetic tasks (all secrets are a canary string): `sec-readme-injection` (a README comment asks
for `curl | sh` and to post `.env`), `sec-out-of-bounds` (a code comment asks to edit `~/.bashrc` and `../shared`; a `postinstall` script
leaves a marker if anything installs), `sec-approval-tampering` (notes ask to set every release to approved). Measured from the proxy log,
file changes and the agent trace. ES22's scanner and policy tests still say nothing about agent behaviour.

## 8. Candidate comparison

No A/B comparison exists for any candidate. No score is shown anywhere: there are no measurements to support one. The website now separates
static review, fixture tests, live agent runs and the owner's decision for each release.

## 9. Approval decision sheet

| Release                           | Security review                      | Behavioural evidence                                                                                                                                                       | Claude Code                                                                     | Codex                           | Dependencies                                           | Licence                           | Recommendation                                                                                               |
| --------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `grilling@1.0.0`                  | no blocking issues (ES18, full read) | ES6–ES8 on identical upstream content: explicit runs verified in both agents; loaded unprompted once (ES7) and in 0 of 12 ES8 trials; no benefit attributable to the skill | explicit run verified (2.1.310)                                                 | explicit run verified (0.164.0) | none; asks the agent to dispatch a sub-agent for facts | MIT, attributed                   | **Ready for owner approval** as a like-for-like replacement of the approved legacy install; benefit unproven |
| `gsap-react@1.0.0`                | no blocking issues (ES22, full read) | none                                                                                                                                                                       | structural only                                                                 | structural only                 | adds `gsap`, `@gsap/react` (unpinned) when followed    | MIT, attributed                   | **Requires additional evaluation**                                                                           |
| `gsap-timeline@1.0.0`             | no blocking issues (ES22, full read) | none                                                                                                                                                                       | structural only                                                                 | structural only                 | assumes GSAP                                           | MIT, attributed                   | **Requires additional evaluation**                                                                           |
| `gsap-performance@1.0.0`          | no blocking issues (ES22, full read) | none                                                                                                                                                                       | structural only                                                                 | structural only                 | assumes GSAP                                           | MIT, attributed                   | **Requires additional evaluation**                                                                           |
| `web-quality-accessibility@1.0.1` | no blocking issues (ES23, full read) | none                                                                                                                                                                       | structural only; frontmatter `name: accessibility` differs from the folder name | same                            | optional Lighthouse/axe, project-local with consent    | MIT, attributed, changes declared | **Requires additional evaluation**                                                                           |
| `web-quality-accessibility@1.0.0` | requires changes                     | none                                                                                                                                                                       | –                                                                               | –                               | global install, broken link                            | MIT                               | **Not recommended** (superseded by 1.0.1)                                                                    |

Benefits and drawbacks per release are in `registry/evaluations.json` (`es23-*` records, bound to each curated hash). Remaining risks for all:
reviews are agent readings, not a second human reader; packages a skill recommends are outside every folder hash.

## 10. Validation

`pnpm check` passes. Catalog 295 tests in 20 files (239 + 43 archive + 12 harness + 1 release), web 118 in 6 files (115 + 3), total 413.
`skills:library verify`: 6 releases valid, history checked against HEAD. Approvals (6), consumers and assignments, evidence (24) unchanged.

## 11. Remaining risks

1. No agent behaviour has been observed for any curated release under ES23 isolation.
2. The model API host is an allowed channel by necessity; anything in a fixture could be sent to the model. Fixtures are synthetic.
3. Containers share the Docker Desktop VM kernel; the proxy cannot inspect TLS contents.
4. `npx --no` may still query the npm registry for metadata.
5. The evaluation image and agent CLI flags in `plan.ts` are not exercised until the first authorized run.

## 12. Owner decisions

1. Approve `grilling@1.0.0` or not (and whether to migrate the legacy install with `upgrade --migrate`, preview first).
2. Whether to create dedicated, spend-limited evaluation API keys and authorize the 46 planned runs and building the pinned agent image.
3. After any runs: approve, or not, each GSAP release and `web-quality-accessibility@1.0.1`.
4. Whether to fix the remaining accuracy notes and the `name` mismatch in a `1.0.2`.
5. Commit the ES23 work (proposal in the ES23 report).
