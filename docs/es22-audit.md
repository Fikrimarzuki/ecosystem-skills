# ES22 security audit and adoption readiness (2026-10-30)

For the owner. This records what ES22 checked, what it fixed, what it staged, and what still needs a decision. Nothing in ES22 approved,
installed, activated, committed, pushed or deployed anything. "Reviewed" below always means "read in the stated scope", never "safe".

## 1. Baseline

| Item               | Expected | Found at the start of ES22                                                                     |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| Branch / HEAD      | `main`   | `main`, HEAD `d04b07d`, nothing staged, 58 uncommitted paths (ES16–ES21)                       |
| Registered skills  | 245      | 245                                                                                            |
| Sources            | 58       | 58                                                                                             |
| Approved skills    | 6        | 6: grilling, writing-plans, verification-before-completion, frontend-design, caveman, ponytail |
| Curated releases   | 1        | 1: `grilling@1.0.0`, unapproved, review `no-blocking-issues`                                   |
| Passing tests      | 327      | 327 (catalog 212, web 115)                                                                     |
| Legacy assignments | 4        | 4 external (plus 2 first-party): see §8                                                        |

No differences from the expected baseline.

## 2. Trust boundaries

For each boundary the question was whether untrusted data (upstream content, registry text, archive members, local files) can influence
paths, shell commands, agent instructions, registry writes, approval status, network destinations, installed content or consumer
configuration.

| #   | Boundary                   | Controls verified                                                                                                                      | ES22 finding                                                       |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | External source discovery  | Registry is data; ids, URLs and 40-hex pins are schema-checked; discovery never grants approval                                        | none                                                               |
| 2   | Upstream content retrieval | Fixed `codeload.github.com` URL from a parsed GitHub URL; size cap; archive top folder must equal `<repo>-<sha>`; `execFile`, no shell | **F1**, **F3**; archive traversal tested (§3)                      |
| 3   | Content hashing            | `scanTree` never follows symlinks; special files reported; hash covers paths, modes and bytes                                          | none                                                               |
| 4   | Curation and staging       | Atomic stage, never over an existing folder; licence must be recognised; record always unreviewed and unapproved                       | **F1**, **F6**                                                     |
| 5   | Security review evidence   | Review bound to `curatedHash`; `no-blocking-issues` needs 26 checks and manual-read evidence; worksheet drafts nothing as clean        | **F5** (scanner gaps)                                              |
| 6   | Release approval           | Validator: approved needs a complete review, an approver, no blockers; approved releases are frozen                                    | new rule: no unresolved references (§6)                            |
| 7   | Installation preview       | Pure plan; blockers listed; nothing written                                                                                            | new dependency blockers (§6)                                       |
| 8   | Curated installation       | Journaled transaction (store, registry, links, lock), undo in reverse; conflicts never overwritten                                     | **F4** (store re-check at apply), lock path must be a regular file |
| 9   | Consumer assignment        | Atomic registry write with `expectedCurrent`; `--project` checked against `consumers.local.json`                                       | none                                                               |
| 10  | Version upgrades           | Approved targets only; legacy needs `--migrate`; verification reset on change                                                          | none (fixture lifecycle, §7)                                       |
| 11  | Rollback                   | Only versions previously installed here, from a verified store copy of a still-approved release                                        | none (interrupted rollback tested)                                 |
| 12  | Upstream update detection  | `git ls-remote` via `execFile`; folder downloaded as data; results never change pins or approvals                                      | **F2**, **F3**                                                     |
| 13  | Website rendering          | React text rendering only (no `dangerouslySetInnerHTML`); links built from parsed GitHub URLs; no safety claims                        | none                                                               |

### Findings and fixes

| Id  | Severity   | Issue                                                                                                                                                                                  | Fix and regression test                                                                                                  |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| F1  | Medium     | A root `LICENSE` that is a **symlink** in an upstream archive was read and could copy a local file (e.g. a secret) into a prepared release, which is then committed.                   | `fetchSkill` returns only regular root files; `preparePlan` re-checks. Tests: symlinked LICENSE never read or copied.    |
| F2  | Low–medium | A symlinked `SKILL.md` in a downloaded folder was read for frontmatter, so local file content could reach `updates.json`.                                                              | Only regular files are read; a non-regular `SKILL.md` is reported as security-sensitive. Test included.                  |
| F3  | Low        | The update checker accepted any URL (including `http:` and non-GitHub hosts), so registry data chose the network destination.                                                          | Only `https://github.com/<owner>/<repo>`; refused before any network call. Test included.                                |
| F4  | Low        | Time-of-check/time-of-use: a store folder swapped for a symlink between preview and apply.                                                                                             | Apply re-checks every store path component. Test swaps in a symlink after the preview.                                   |
| F5  | Low        | The scanner had no rules for approval/registry tampering, installing further skills, requests to reveal secrets, or sending data to a URL.                                             | Four rules, mapped to review categories. Tests cover each attack class.                                                  |
| F6  | Low        | Out-of-folder links (sibling skills) were not detected, so a curated copy could ship broken references; once added, example HTML in code fences produced false dependencies.           | Reference detection, declaration, validation and install blockers (§6); closed code fences skipped, unclosed fences not. |
| F7  | Low        | A lock path that is a directory raised a raw `EISDIR`; `prepare --apply` failed when `registry/releases.json` did not exist yet; generated restriction text went stale after a review. | Clear `ConsumerError`; absent file handled; state-free text. Tests included.                                             |

No issue let untrusted content change an approval, run a command, or write outside the repository's own folders.

## 3. Adversarial fixture tests

`packages/catalog/test/es22-adversarial.test.ts` (24 tests) and `es22-lifecycle.test.ts` (2 tests). Every malicious file is data: nothing
is executed and no agent reads it.

- **Prompt injection** (override wording, credential requests, sending files to a URL, changing approval status, hidden text in reference
  files, installing other skills): the scanner flags each class, the worksheet maps them to categories and drafts nothing as clean, and a
  skill's text cannot change its approval (approval is a registry fact checked by validation).
- **Archives**: symlinked root LICENSE, symlinked SKILL.md, wrong top folder, and a hand-built archive with a `../` member, a planted
  symlink with a file written through it, and an absolute member. The hostile archive is refused; nothing appears outside the staging area. A
  control archive in the same format extracts normally. The `..`/symlink protection comes from the system `tar` defaults (no `-P`).
- **Filesystem**: nested symlinks and FIFOs fail verification; a forged lock entry cannot make tampered content verified; a file in the
  consumer's skill slot is a conflict; a store symlink swapped in after preview is refused.
- **Transaction failures from real errors** (not simulated): unreadable library file, read-only agent directory, read-only `external`
  directory for the lock, a lock path that is a directory, an interrupted rollback. Each leaves no partial state.
- **Dependencies**: undeclared, unresolved, mismatched and missing sibling releases.

Covered by earlier suites and re-run: path-safe ids and paths (`consumers.test`, `cliargs.test`), review bound to the curated hash and
complete-review gates (`library.test`), approval with discovery blockers (`es161-safety.test`), frozen approved releases, unapproved upgrade
targets and interrupted upgrades (`es21.test`), assignment write conflicts and full undo (`curated.test`).

**Limitation:** these tests show what the scanner flags and what the policy refuses. They do **not** show that an agent would resist a
prompt injection. No isolated agent run was made.

## 4. `grilling@1.0.0` readiness

| Content                        | Revision  | Folder hash                         |
| ------------------------------ | --------- | ----------------------------------- |
| Approved legacy pin (ES6)      | `5beb35b` | `sha256-f8441dad…` (owner-reviewed) |
| Curated 1.0.0 upstream content | `5beb35b` | `sha256-f8441dad…` (identical)      |
| Latest upstream (ES20 and now) | `a496f55` | `sha256-9c297a10…`                  |

The only upstream change is one phrase in `SKILL.md` line 28: "dispatch a sub-agent" became "dispatch a sub-agent **with a fresh context
window**". No new files, tools, commands, links or dependencies. LICENSE (MIT) unchanged. The curated release is internally consistent:
its review covers the exact `curatedHash`, and only the declared `LICENSE` and `ATTRIBUTION.md` were added.

**Readiness:** `1.0.0` meets every gate except owner approval. Options: approve `1.0.0` as is (matches what you reviewed in ES6), or prepare
`1.1.0` from `a496f55` (a new unreviewed record needing its own review). Neither was done.

## 5. Candidates

All four were staged with `pnpm skills:library prepare … --apply` at their registry pins. Each upstream folder hash equals the pinned
discovery hash; all are MIT (GreenSock and Addy Osmani root licences, copied unchanged). All are **unapproved**.

| Release                                       | Review (recorded, not an approval) | Notes                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gsap-react@1.0.0` (`aed9cfd`)                | `no-blocking-issues`               | 3 files read in full. Installation section adds the `gsap` and `@gsap/react` npm packages (unpinned); recorded as a restriction. Description steers toward GSAP but defers to the user's choice.                                                                                                                                                                                               |
| `gsap-timeline@1.0.0` (`aed9cfd`)             | `no-blocking-issues`               | 3 files read in full; 0 signals; no commands.                                                                                                                                                                                                                                                                                                                                                  |
| `gsap-performance@1.0.0` (`aed9cfd`)          | `no-blocking-issues`               | 3 files read in full; 0 signals; no commands.                                                                                                                                                                                                                                                                                                                                                  |
| `web-quality-accessibility@1.0.0` (`afa8da9`) | `requires-changes` (partial scope) | Global `npm install @axe-core/cli -g` (SKILL.md:416) and unpinned `npx lighthouse` (:413); unresolved link to `../web-quality-audit/SKILL.md` (:462). Accuracy: large-text threshold given as 18px/14px bold instead of 18pt/14pt. Evaluated: install scripts, global config and hidden dependencies (instructions), every signal, comment and non-ASCII character; the rest is not evaluated. |

**Compatibility:** all four use standard `SKILL.md` frontmatter (name, description, licence) with no tool grants, hooks or agent-specific
features, so they are structurally compatible with Claude Code and Codex. No agent run was made, so `supportedAgents` stays empty.

## 6. Dependencies

`web-quality-accessibility` works on its own: the sibling link is optional reading in its References list. Installed alone, the link is
broken. It is recorded as an **unresolved** reference, which blocks approval and installation until one of:

1. curate `web-quality-audit` as its own release and declare `requires-release` (installed alongside, same consumer, declared version), or
2. publish a new version that removes or rewrites the link, declared as a modification.

The sibling folder name matches the registry id (`web-quality-audit`), so option 1 would resolve. In contrast, `web-quality-core-web-vitals`
links to `../performance/…`, which no registry id can satisfy; it would need option 2. The three GSAP skills mention sibling skills by name
only and have no out-of-folder links.

## 7. Installation lifecycle (fixtures only)

`es22-lifecycle.test.ts` runs prepare → synthetic review and approval → install → verify → prepare `1.1.0` (no inherited approval) →
approve → upgrade → rollback → inventory in a disposable repository. Hashes are checked at each stage. There is exactly one download, at
preparation; afterwards `fetch` throws, so no network request can happen unnoticed. A planted script never runs. The real registry is hashed
before and after each test and does not change. The legacy installer refuses unapproved skills and is never a fallback.

## 8. Legacy recovery plan (read-only; nothing was reinstalled)

`external/` holds only `README.md`: there is no `external/skills/` and no `external/installed.json` on this machine. The committed links in
this repository (`.claude/skills` and `.agents/skills` for grilling and verification-before-completion) therefore dangle, as do Playnest's
git-ignored links. All pinned revisions still resolve upstream (HTTP 200 from codeload, checked with HEAD requests only).

| Skill                          | Upstream @ pin                | Expected folder hash       | Consumers (all legacy, links)                  |
| ------------------------------ | ----------------------------- | -------------------------- | ---------------------------------------------- |
| grilling                       | mattpocock/skills @ `5beb35b` | `sha256-f8441dad…`         | ecosystem-skills (symlink)                     |
| verification-before-completion | obra/superpowers @ `2ce8aa1`  | `sha256-7ae5df56…`         | ecosystem-skills (symlink), playnest (symlink) |
| frontend-design                | anthropics/skills @ `dbd4588` | `sha256-89758098…`         | gateway (copy; no links exist yet)             |
| writing-plans                  | obra/superpowers @ `2ce8aa1`  | `sha256-1bb69e9a…`         | none                                           |
| caveman, ponytail              | approved in ES11.2            | see `registry/skills.json` | none                                           |

Destination: `external/skills/<id>`, recorded in `external/installed.json` (both git-ignored). Steps for the owner, one skill at a time:

1. `pnpm skills:install <id>`: downloads the pinned commit as data and refuses unless the folder hash equals the approved hash.
2. `pnpm skills:status`: shows revision and hash per installed skill.
3. `pnpm skills:sync <consumer> --project <dir> --dry-run`, then without `--dry-run` (Playnest's links already point at the right path and
   resolve once step 1 is done; no change to that repository is needed).
4. `pnpm skills:verify <consumer> --project <dir>`.

Possible conflicts: a folder already at `external/skills/<id>` that is not in `installed.json` is refused (never overwritten); the gateway's
copy mode writes into that repository, so preview first. Grilling also has the curated `1.0.0`; restoring the legacy install does not change
it, and a later move to curated is an explicit `upgrade --migrate`. Rollback: `pnpm skills:uninstall <id>` moves the folder into
`external/.backups` (never deletes) and drops it from `installed.json`. `pnpm skills:rollback <id>` restores the most recent backup, so it
only applies after a `--replace`; none exists on this machine today.

## 9. Registry integrity

Structural (offline): 245 unique ids (also case-insensitive), 243 unique upstream locations, 58 sources, every external pin a 40-hex SHA,
every URL canonical `https://github.com/<owner>/<repo>`, all 216 discovery hashes recomputed from the ES16 snapshots, 29 historical entries
byte-identical to HEAD, approvals unchanged (6), 23 skills with approval blockers, 11 evaluations referencing existing skills, 13 update
records matching current pins (12 up to date, grilling review-required), every release's `ATTRIBUTION.md` naming its commit and hash, the
deterministic catalog. Licences: MIT 173, Apache-2.0 50, unknown 13, BSD-3-Clause 6, CC-BY-SA-4.0 1, and two first-party skills without a
third-party licence. Live: codeload HEAD for the 5 repository/commit pairs used by approved and curated skills (all 200); the other pins were
not re-downloaded.

## 10. Website

168 page loads (14 pages × 3 widths (375, 768, 1280) × light/dark × English/Indonesian): no horizontal overflow, console errors, wrong
`lang`, wrong theme or missing heading. Empty search and 404 pages explain themselves in both languages; `/#/skills/<id>` and `/#/consumers`
redirect to clean URLs (routes added after the hash era, such as `/sources`, were never hash routes). The release page lists links outside the
release (new in ES22, translated). No page claims a skill is safe. Registry text (modification reasons, notes) stays in English on Indonesian
pages, as before.

## 11. Repository

No secrets (token, key and private-key patterns), no files over 500 KB, no binaries, no absolute home paths in the diff. `dist/`,
`external/*`, `consumers.local.json`, `.env` and the generated `apps/web/public/catalog.json` are ignored. Consumer repositories were
not modified.

## 12. Owner decisions

1. **grilling**: approve `1.0.0` as is, or prepare and review `1.1.0` from `a496f55` first.
2. **GSAP releases**: approve any of `gsap-react`, `gsap-timeline`, `gsap-performance@1.0.0` (reviews recorded; `gsap-react` adds npm
   dependencies to a project when followed).
3. **web-quality-accessibility**: choose how to resolve the sibling link (curate `web-quality-audit`, or a `1.1.0` that removes it and
   replaces the global install), then a full review. Not approvable today.
4. **Agent evaluation**: whether to authorize isolated agent runs (ES19 plan) before any approval; none has been run.
5. **Legacy recovery**: whether and when to run `pnpm skills:install` for the six approved skills (§8), and whether to keep the dangling
   committed links in this repository until then.
6. **Commit**: how to group the uncommitted ES16–ES22 work (proposal in the ES22 report).

## 13. Remaining risks

1. No agent run: scanner and policy tests say nothing about how an agent behaves when following any skill, or resists injection.
2. Agent reviews are recorded on the owner's behalf in a stated scope; they are not a second human reader.
3. Archive path safety relies on the system `tar` defaults; a platform whose `tar` allows `..` members would need its own test run. (Resolved in ES23: extraction no longer uses `tar`; see [es23-pilot.md](es23-pilot.md).)
4. Recommended packages (`gsap`, `@gsap/react`, axe, Lighthouse) and runtime downloads are outside every folder hash.
5. The legacy store is missing on this machine, so legacy consumers currently have dangling links.
6. Reference detection covers Markdown links and `src`/`href`; a path mentioned in plain prose (not a link) is not detected.
