# Curated skill library (ES17–ES22)

Ecosystem Skills keeps two kinds of knowledge about a third-party skill, deliberately apart:

1. **Discovery records**: metadata only, in `registry/skills.json` and `registry/sources.json` (245 skills). No content is stored.
2. **Curated releases**: versioned local copies under `library/<skill>/<version>/` with a record in `registry/releases.json`.

Everything below is **implemented** unless it is marked _planned_. Nothing in this repository approves anything by itself, installs
anything without an explicit `--apply`, or runs third-party content.

## 1. Hybrid architecture

```
upstream repo @ pinned commit ──(discovery: metadata + hash)──► registry/skills.json        source reference only
        │
        └─(prepare / stage, data only)──► library/<skill>/<version>/  + registry/releases.json   curated, unapproved
                                                │  security review (recorded) + owner approval
                                                ▼
                                   external/releases/<skill>/<version>/   machine-local store (git-ignored)
                                                │  relative symlinks, atomic
                                                ▼
                                   <consumer>/.claude/skills/<skill>, .agents/skills/<skill>
```

Four questions are answered separately and never inferred from one another:

| Question                           | Where                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------- |
| Is the skill reviewed/approved?    | `skills.json` → `review` (legacy approval of one upstream revision + hash) |
| Is there a local curated copy?     | content availability, derived from `releases.json`                         |
| Was a release security-reviewed?   | `releases.json` → `review` (outcome, scope, 26 checks, evidence, hash)     |
| Is a release approved?             | `releases.json` → `approval` (owner and date)                              |
| Which version does a consumer use? | `consumers.json` → `assignment.release` (desired state)                    |
| What is installed on this machine? | `external/releases.lock.json` (machine-local, never published)             |

Content availability states: `source-only` (222), `curation-blocked` (16: unknown licence or repository-root skill), `curated-unapproved` (5),
`curated-approved` (0), `curation-pending` (supported, unused), `first-party` (2). A source-only page explains why and links the original.

## 2. Security review workflow (ES18)

1. `pnpm skills:library review <skill> [--version x.y.z] [--json]` produces a **worksheet**: the folder hash (and whether it matches the
   record), every file with its scope (instructions = `SKILL.md`, everything else = supporting files), frontmatter, and automated signals
   mapped to the 13 categories: scanner rules (network, installs, shell, writes, home/agent-config paths, secrets, override wording, remote
   instructions, hidden text; since ES22 also approval/registry tampering, installing other skills, requests to reveal secrets and sending
   data to a URL), scripts, binaries, symlinks, out-of-folder links, `allowed-tools`, `hooks`, and load-time shell injection (`` !`…` ``).
   Signals are deliberately over-inclusive (e.g. "allow paste in password fields" trips the secrets rule); they point a reader at lines.
2. The draft marks a category with signals `needs-manual-review` and every other one `not-evaluated`. **Nothing is ever drafted as clean.**
3. A reviewer reads every file and records in `releases.json`: outcome, reviewer, date, written scope, the `contentHash` reviewed
   (must equal the release's `curatedHash`), all 26 category × scope checks, and evidence.
4. Validation enforces: `no-blocking-issues` needs all 26 checks `no-issue-found`, a scope, and **manual-read** evidence (a scan alone is
   refused); `requires-changes` needs an `issue-found`; `requires-manual-review` a `needs-manual-review`; `blocked` an `issue-found` and notes.

Outcome labels never say "safe": _No blocking issues identified in the reviewed scope_, _Requires changes_, _Requires further manual review_,
_Blocked_, _Not evaluated_.

**`grilling@1.0.0`** has a genuine review (ES18): all 4 files read in full, 0 automated signals, 26 checks recorded with notes, outcome
`no-blocking-issues`, reviewer "Claude (ES18 agent review, recorded for the owner; not an approval)". The release is still **unapproved**.

ES22 staged four more releases with `prepare` and recorded agent reviews the same way (details in [es22-audit.md](es22-audit.md)):
`gsap-react`, `gsap-timeline` and `gsap-performance@1.0.0` are `no-blocking-issues` after reading every file; `web-quality-accessibility@1.0.0`
is `requires-changes` (a global `npm install -g`, an unpinned `npx`, and an unresolved link to a sibling skill), with a partial scope stating
which categories were not evaluated. All five releases are **unapproved**.

## 3. Curated installation (ES18)

```sh
pnpm skills:library install <consumer> <skill> --version <x.y.z> [--project <dir>] [--agents a,b]          # preview, changes nothing
pnpm skills:library install <consumer> <skill> --version <x.y.z> [--project <dir>] [--agents a,b] --apply  # performs exactly that plan
```

The preview shows: release and version, destination, every file, store state, existing links and what happens to each, conflicts, security
review outcome and scope, approval status, rollback availability, compatibility notes and **blockers**. Eligibility: the release is
approved, its review is `no-blocking-issues`, the skill is not rejected, no discovery approval blocker, known licence, not a repository-root
skill, provenance matches the registered source, the library folder verifies (hash, no symlinks, licence and attribution present), and every
out-of-folder link is resolved: the required release is installed for the same consumer at the declared version (ES22, §7a).

Apply, in one transaction (every completed step is undone in reverse order on any failure, and the error says what was undone):

1. copy `library/<skill>/<version>` to a staging folder, re-hash, rename into `external/releases/<skill>/<version>` (never over an existing
   folder; a tampered or untracked store folder blocks),
2. validate and atomically write the assignment with `release: "<version>"` to `registry/consumers.json` (refused if it changed since the preview),
3. create or atomically re-point the consumer's relative symlinks (`.claude/skills`, `.agents/skills`; symlinked agent directories,
   foreign links and unmanaged files are conflicts and are never overwritten),
4. record the install in `external/releases.lock.json`: store entry (content hash, time, release identity: skill, version, curated hash,
   upstream URL and commit) and the consumer's current deployment and history (consumer id, version, hash, time, action).

Never: downloads, fallback to upstream, running bundled scripts (they are copied as files; a test plants a script that would leave a marker),
writing tracking data into a consumer repository. `skills:sync` and `skills:verify` understand curated assignments (the canonical copy is the
verified store folder) and report a tampered store as an error. The **legacy installer** (`skills:install`, upstream download into
`external/skills`) is unchanged and still the path for the 6 approved skills.

## 4. Release versioning

Semantic versions, independent of upstream versions and commits; unique per skill; `path` is always `library/<skill>/<version>`. Releases are
append-only and immutable (`pnpm skills:library verify` compares with `HEAD`); approved releases are frozen except withdrawal. A changed folder
needs a new version. `pnpm skills:library stage` copies content atomically and never overwrites.

## 5. Evaluation methodology (ES19)

- Tasks in `packages/catalog/evals/es19/tasks.ts`: `gsap-react-entrance`, `gsap-scroll-reveal`, `gsap-timeline-intro`, `a11y-signup-form`,
  `cwv-hero-page`, `design-landing`. Each is run identically in arm **A** (no skill), **B** (candidate) and **C** (approved alternative,
  `frontend-design` for design) with the same prompt and fixture.
- Every task scores the same 9 criteria: correctness, quality, maintainability, accessibility, performance, instruction adherence,
  unnecessary changes, security behaviour, token usage. Automated checks read the files the agent left; judgement criteria are `manual`;
  token usage comes only from agent traces. Nothing is turned into a single score.
- `pnpm --filter @ecosystem-skills/catalog eval:es19 [--skill <id>] [--out <dir>]` writes the plan and identical fixture workspaces per arm
  (no skill content placed). `--live` only reports the gate: a candidate must be approved (or have an approved release) and unblocked, and a
  run still needs owner authorization and an isolated environment.
- **No agent was run in ES19.** All candidates except `frontend-design` are unreviewed; running their instructions in an agent on this
  machine would execute unreviewed content with the owner's accounts. Results are 11 **static assessments** in `registry/evaluations.json`
  (security, compatibility, measured sizes and token estimates, strengths, weaknesses, comparison "not run", recommendation, blockers).
  Validation forbids a static assessment from claiming a run or citing run evidence; recommendations never change approvals.

## 6. Upstream update checks (ES20)

```sh
pnpm skills:library check-upstream <skill>... | --source <id> | --all [--limit 25] [--delay 1000] [--write]
```

Manual only (no scheduler). `git ls-remote` per repository (one per batch), then, if the default branch moved, the skill folder at the new
commit is downloaded as data and hashed. Statuses: `up-to-date` (same commit, or the folder is unchanged), `update-available` (folder changed;
discovered skill), `review-required` (folder changed; approved or curated skill), `source-unavailable` (repository missing, or the folder was
deleted or moved), `check-failed` (network or download failure), and `never-checked` (no record; the site makes no claim). The check time
(`checkedAt`) is kept apart from the upstream commit date. Change inspection classifies instructions, references, scripts, hooks, dependency
manifests, permissions (frontmatter `allowed-tools`/`hooks`/`model`/`context`), licences and assets, and lists security-sensitive changes
(including new scanner signals and new binaries). `--write` records results in `registry/updates.json`, one per skill.

Recorded on 2026-10-30 for 13 skills: 12 up to date, and **`grilling` review required** (its upstream `SKILL.md` changed after the approved pin).

## 7. Release preparation (ES20)

```sh
pnpm skills:library prepare <skill> --version <x.y.z> [--revision <sha>]          # preview
pnpm skills:library prepare <skill> --version <x.y.z> [--revision <sha>] --apply  # stage + record
```

Downloads the folder at the given (or latest) commit as data, adds the repository's licence text if the folder lacks one and an
`ATTRIBUTION.md`, declares both as modifications, checks the licence (refuses a missing, unrecognised or changed licence), refuses an existing
or non-increasing version and curation-blocked skills, stages it immutably and appends a record that is **always `not-evaluated` and
`unapproved`**, whatever earlier versions had. A failed registry write removes the staged folder. Since ES22 it reads only regular files from
the archive (a `LICENSE` or `SKILL.md` that is a symlink is ignored or flagged), accepts only `https://github.com/<owner>/<repo>` sources, and
records every out-of-folder link as an `unresolved` reference.

## 7a. Out-of-folder references (ES22)

Some skills link to files outside their own folder, typically a sibling skill (`../web-quality-audit/SKILL.md`). Copying a folder on its own
breaks such links, and silently copying the sibling would package unrelated, unreviewed content. So:

- `outOfFolderReferences` finds Markdown links and `src`/`href` attributes in `.md`/`.txt`/`.html` files that leave the folder (relative
  paths that climb out, or absolute paths). URLs and anchors are ignored. Example markup inside **closed** fenced code blocks is ignored (an
  `<a href="/about">` in an HTML sample is not a dependency); an unclosed fence hides nothing. The security scanner still reads fenced code.
- Each release declares its references in `releases.json` → `references`: `unresolved` (with a note), or `requires-release` naming the
  `{ skill, version }` that must be installed alongside. `pnpm skills:library verify` fails on an undeclared link or a stale declaration.
- Validation: a `requires-release` target must exist and its folder name must match the link (installed skills sit in folders named after their
  id, so a link to `../performance/` can never be satisfied by `web-quality-performance`); an approved release cannot have an unresolved reference and
  can only require an approved release.
- Install/upgrade previews block when a required release is missing for that consumer, or installed at another version.

To resolve a reference, either curate the sibling as its own release and declare `requires-release`, or remove/rewrite the link as a declared
modification in a new version.

## 8. Consumer version tracking (ES21)

`pnpm skills:library status [<consumer>] [--project <dir>]` (read-only) shows per assignment: legacy vs curated, desired version (registry),
installed version (link targets, when the project location is known), tracked hash, store state, newest approved upgrade, drift (store not
verified, tracking or links disagree with the registry, legacy install unusable), and whether a rollback is available. A legacy install is
never reported as curated. The website shows legacy/curated and any approved upgrade with its preview command; installed state stays
machine-local.

## 9. Upgrade and rollback (ES21)

```sh
pnpm skills:library upgrade  <consumer> <skill> --to <x.y.z> [--migrate] [--apply]
pnpm skills:library rollback <consumer> <skill> --to <x.y.z>|legacy [--apply]
```

Same engine and guarantees as install: preview by default (file-level changes, conflicts, review and approval of the target, compatibility
notes from the release, rollback availability), version-pinned, approved targets only, verified hashes, safe paths, atomic link replacement,
unrelated files untouched, full transactional undo on failure. Rollback only restores a version **previously installed for that consumer on
this machine**, from a verified store copy of a still-approved release; tampered or withdrawn content is refused. The verification status of an
assignment is reset to `unverified` whenever its version changes.

## 10. Legacy migration

Explicit and reversible, never silent: a legacy assignment refuses `upgrade` unless `--migrate` is given. The first curated change records a
`baseline:legacy` entry, so `rollback --to legacy` restores the upstream install (`external/skills/<id>`) and removes `release` from the
assignment. Suggested order (each step an owner decision): review and approve one release (for example `grilling`, after reviewing its upstream
change), install it for one disposable consumer, verify with an agent run, then migrate a real consumer with a preview first. No consumer
repository was changed in ES18–ES21.

## 11. Remaining limitations and planned work

- No curated release is approved, so no real consumer can use the curated path yet (by design).
- Releases list no `supportedAgents`: compatibility with Claude Code and Codex is structural only (standard `SKILL.md` frontmatter, no tool
  grants, no agent-specific features) until an agent run is authorized.
- No live agent evaluation has been run (_planned_, after approval and an isolated environment are authorized).
- Reviews are human or agent readings of the stated scope; automated signals cannot establish safety, and binaries fetched at run time by a skill
  (e.g. Impeccable's engine) are outside any folder hash.
- `check-upstream` compares folder content; it does not follow a skill that moved to a new path (reported as `source-unavailable`).
- Copy-mode activation is not supported for curated releases; Windows is untested.
- The `external/releases.lock.json` tracking is per machine; another machine has its own.
