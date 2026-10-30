# Consumer management CLI

Manage which skills each consumer project gets, and reconcile its project-local agent links, without editing
the registry or creating symlinks by hand. All commands run from the repository root.

## Five separate things

| Concept          | Meaning                                                                      | Where it lives                                                   | Changed by                          |
| ---------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| **Approval**     | An external skill passed review for its pinned revision                      | `registry/skills.json` (`review.status`)                         | the owner, by editing the registry  |
| **Installation** | The external skill's files exist locally and match the reviewed content hash | `external/skills/<id>` + `external/installed.json` (git-ignored) | `pnpm skills:install`               |
| **Assignment**   | A consumer _should_ have the skill (desired state)                           | `registry/consumers.json`                                        | `skills:assign` / `skills:unassign` |
| **Activation**   | The consumer project actually exposes the skill to an agent                  | `<project>/.claude/skills/<id>`, `<project>/.agents/skills/<id>` | `skills:sync`                       |
| **Verification** | An agent was run and shown to load or follow the skill                       | `registry/evidence.json` and the assignment's `verification`     | the owner, from real agent runs     |

None implies the next (a skill can also be approved and never installed, or installed and never assigned). An assignment does not install or activate anything; a link does not prove an agent loads
or uses the skill. **Runtime verification is never inferred from links**: `verification` in the registry changes
only from real agent runs (see `docs/external-skills.md`).

First-party skills (`skills/…`) need no third-party approval; their canonical folder in this repository is linked
directly and never moved or duplicated. External skills must be approved for their pinned revision, and
installed with a matching content hash, before they can be activated. A rejected skill is never assignable.

## Where consumers live

Consumer locations are machine-specific, so they are **not** in the registry or the public catalog. Either pass
`--project <dir>`, or list them in a git-ignored `consumers.local.json` (paths relative to this repository):

```sh
cp consumers.local.example.json consumers.local.json   # { "ecosystem-skills": ".", "ecosystem-assets": "../ecosystem-assets" }
```

Global consumers (`kind: "global"`) are not managed: global activation is out of scope.

## Onboarding: from discovery to verified use

Nine steps, each separate. Steps marked **owner** change what a project is allowed or made to use, so they are the
owner's decision; nothing in the CLI approves, activates or verifies on its own.

| #   | Step                    | Command or action                                                                                                                                                                    | Who                  | What changes                                           |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------------------------------------------------------ |
| 1   | Find a skill            | Website **Skills** page filters, or `pnpm skills:list`                                                                                                                               | any                  | nothing                                                |
| 2   | Review its status       | Open the skill page (Lifecycle, Review, Findings). For a new candidate: `pnpm skills:review <skill-id>`, then read the files                                                         | any                  | nothing registered; downloads go to `external/.review` |
| 3   | Approve it              | Edit `review` in `registry/skills.json` (`status: approved`, `approvedBy`) for the pinned revision, then `pnpm catalog:validate`                                                     | **owner**            | registry (git diff)                                    |
| 4   | Install locally         | `pnpm skills:install <skill-id>` (approved skills only)                                                                                                                              | any                  | `external/skills`, this machine only                   |
| 5   | Assign to a consumer    | `pnpm skills:assign <consumer-id> <skill-id> --dry-run`, then without `--dry-run`                                                                                                    | **owner**            | `registry/consumers.json` (desired state)              |
| 6   | Preview synchronization | `pnpm skills:sync <consumer-id> --dry-run`; check the Consumer, Project and Git lines                                                                                                | any                  | nothing                                                |
| 7   | Activate                | `pnpm skills:sync <consumer-id>`                                                                                                                                                     | **owner**            | relative links inside that project                     |
| 8   | Verify the links        | `pnpm skills:verify <consumer-id>`                                                                                                                                                   | any                  | nothing (filesystem and hash checks)                   |
| 9   | Verify with an agent    | Run Claude Code or Codex in the project, ask for the skill by name, then record the run in `registry/evidence.json`; natural triggering needs the trials in `external-skills.md` §11 | **owner** records it | evidence, kept separate from steps 1–8                 |

Skip step 4 for first-party skills (they are used from `skills/`) and steps 2–3 (no third-party review applies).

Rules that hold at every step:

- Approved is not installed, installed is not assigned, assigned is not activated, activated is not verified.
- Links prove exposure, not behavior. Only step 9 produces agent evidence, and an explicit run does not show that the
  skill triggers by itself, nor that it improves results.
- Do not run an upstream project's own installer, hook or `curl | bash` line. Only the registered skill folder is
  installed, from the pinned revision, and nothing from it is executed.
- Run Codex checks one at a time, and never against global configuration (`~/.claude`, `~/.codex`).

## Commands

Every command prints usage, notes and examples with `--help`, for example `pnpm skills:sync --help`.

| Command                                                                                      | Writes             | Purpose                                                                          |
| -------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| `pnpm skills:list`                                                                           | no                 | All skills: source, review status, installed here, assigned consumers            |
| `pnpm skills:list --consumers`                                                               | no                 | Consumers, assignment counts, whether a location is configured                   |
| `pnpm skills:list --consumer <id> [--project <dir>]`                                         | no                 | One consumer's assignments, installation and per-agent activation, plus drift    |
| `pnpm skills:assign <consumer> <skill> [--agents a,b] [--install symlink\|copy] [--dry-run]` | registry           | Add an assignment (`verification: unverified`); installs and links nothing       |
| `pnpm skills:unassign <consumer> <skill> [--project <dir>] [--dry-run]`                      | registry           | Remove an assignment; reports links left behind as drift                         |
| `pnpm skills:sync <consumer> [--project <dir>] [--dry-run] [--prune]`                        | project            | Create/repair links (or copies) to match assignments: this activates             |
| `pnpm skills:verify <consumer> [--project <dir>]`                                            | no                 | Link and integrity report; exits 1 on any error; runs no agent                   |
| `pnpm skills:review <skill>` / `--dir <folder>`                                              | `external/.review` | Download a third-party skill at its pin and print a heuristic scan; runs nothing |
| `pnpm skills:install <skill> [--replace]`                                                    | `external/`        | Install an **approved** skill at its pin, hash-checked                           |
| `pnpm skills:rollback <skill>` / `pnpm skills:uninstall <skill>`                             | `external/`        | Restore the previous install / move an install to `external/.backups`            |
| `pnpm skills:status`                                                                         | no                 | Skills installed on this machine and whether they match the pin                  |
| `pnpm skills:links <dir> [skill…]`                                                           | no                 | Low-level link check of one folder; prefer `skills:verify`                       |

`--agents` defaults to the consumer's agents (only `claude-code` and `codex` are supported). `--install` defaults to
`symlink`; `copy` is for hosts where symlinks are unreliable.

### Consumer id versus project path

The first argument is a **consumer id** from `registry/consumers.json` (list them with `pnpm skills:list --consumers`),
never a folder. Where that consumer lives on this machine is separate: `--project <dir>`, or an entry in the
git-ignored `consumers.local.json`. A relative `--project` is resolved from the **repository root**, the same base as
the paths in `consumers.local.json`: pnpm runs the root `skills:*` scripts there even when you start it from a
subfolder.

When `consumers.local.json` has an entry for the consumer, `--project` must name that same folder, and it may never
name a folder configured for a different consumer. A mismatch stops the command before anything is read from or
written to the project, with both paths in the message. There is no override: correct `consumers.local.json`, or
omit `--project`. Without this check, `sync <other-id> --project <folder> --prune` could treat the links of the
consumer that really lives there as stale and remove them.

### Dry runs

`--dry-run` never writes. For `assign` and `unassign` it validates the whole registry with the change and prints it.
For `sync` it prints the Consumer, Project and Git lines, then each directory and link it would create, re-point or
remove, and stops. Running without `--dry-run` performs exactly that plan, or nothing at all if any entry conflicts.

### Mistakes are errors, not defaults

An unknown option (such as `--dryrun`), an option missing its value or given an empty one (such as an unset
`--project "$DIR"`), an extra argument (such as `dry-run` without dashes), or a skill id where a consumer id belongs
stops the command with a message and the usage line, before anything is written. A silently ignored typo would
otherwise turn a preview into a real write.

`unassign` resolves and checks the project folder (used for its drift report) before it changes the registry, so a
bad `--project` leaves `registry/consumers.json` exactly as it was.

## Example with a disposable project

```sh
mkdir -p /tmp/demo && git -C /tmp/demo init
pnpm skills:assign codyssey grilling --agents claude-code,codex --dry-run   # preview the registry change
pnpm skills:assign codyssey grilling --agents claude-code,codex
pnpm skills:sync codyssey --project /tmp/demo --dry-run                    # preview: nothing is written
pnpm skills:sync codyssey --project /tmp/demo                              # creates relative links
pnpm skills:verify codyssey --project /tmp/demo
pnpm skills:unassign codyssey grilling --project /tmp/demo                 # links stay; reported as drift
pnpm skills:sync codyssey --project /tmp/demo --prune                      # removes only owned stale links
```

(Using a registered consumer id such as `codyssey` with `--project` writes only to the given directory; to keep the
registry clean afterwards, unassign again.)

## How sync decides (ownership rules)

For each assigned skill and agent, sync looks at `<project>/<agent dir>/<skill>`:

| Found                                                                                                  | Result                                         |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| nothing                                                                                                | create a relative symlink (or a verified copy) |
| symlink to the canonical skill                                                                         | ok                                             |
| symlink into this repository's `skills/` or `external/skills/` but broken or pointing at another skill | **owned**: re-pointed atomically               |
| symlink anywhere else                                                                                  | **conflict**                                   |
| directory, copy mode, same content hash                                                                | ok                                             |
| directory with different content, a symlink where a copy is assigned, or vice versa                    | **conflict**                                   |
| any other file or directory                                                                            | **conflict**                                   |

Entries that are not assigned are listed: owned links are **stale** (removed only with `--prune`); anything else is
**unmanaged** and never touched, even with `--prune`.

## What sync and verify print first

Before inspecting or changing anything, `skills:sync` and `skills:verify` print exactly what they will act on:

```text
Consumer: ecosystem-assets (Ecosystem Assets)
Project:  /Users/you/code/ecosystem-assets (from consumers.local.json)
Git:      branch master (repository root)
Mode:     dry run (nothing will be written)
```

`Git:` is read from the project's `.git` (no git process runs). It warns when the path is not a repository root
or not a git repository at all. Check these lines before running sync without `--dry-run`.

## Safety guarantees

- **Dry run writes nothing**: no registry change, no directories, no links.
- **Conflicts stop everything**: if any assigned entry is a conflict or fails integrity, sync changes nothing.
- **No writing through symlinks**: `.claude`, `.claude/skills`, `.agents`, `.agents/skills` must be real directories
  (or absent); a symlink at any of them stops the command. Containment uses resolved paths and `path.relative`, not
  string prefixes. Project roots of `/` or the home directory are refused.
- **Integrity before activation**: external installs must match their lock entry, pinned revision and reviewed
  content hash; first-party sources must exist inside `skills/` with a `SKILL.md` and no symlinks. Nothing is
  fetched, installed, or executed.
- **Atomic registry writes**: the whole registry is validated with the change first; the file is written to a
  fsynced temp file and renamed into place; if `consumers.json` changed during the command, nothing is written.
- **Recoverable sync**: each step is journaled; on any failure completed steps are undone in reverse order. Copies
  are built in a temp directory, hash-checked, then renamed into place. Re-pointing replaces the link itself, never
  its target. The error says what was undone; if a step could not be undone it says `ROLLBACK INCOMPLETE` and lists
  the paths left behind, so it never reports a rollback that did not happen.
- **Never global**: only project-local `.claude/skills` and `.agents/skills`; `~/.claude`, `~/.codex` and Codex's
  bundled skills are never touched.

## Conflicts and recovery

- **A conflict** is something sync will not overwrite. Inspect it, move it out of the way yourself, and re-run
  `skills:sync --dry-run`.
- **To undo an activation**, unassign the skill, then `skills:sync <consumer> --prune`. Only owned symlinks are
  removed; copies and anything unmanaged stay.
- **To undo an assignment**, `skills:unassign`. Registry changes are ordinary git diffs to `registry/consumers.json`.
- **After an interrupted sync**, if rollback itself was interrupted, run `skills:verify`: leftover entries named
  `.<skill>.es-tmp-*` are temporary and safe to delete, and owned links can be repaired by `skills:sync`.

## Known limitation: copy-mode race

A copy is built in a temporary directory, hash-checked, and renamed into place only if the destination is still
absent. Between that last check and the rename there is a very small window: if something creates an _empty_
directory at the destination in that instant, the rename can replace it (POSIX rename onto an empty directory).
Nothing with content can be replaced, and symlink mode does not have this window. Avoid running two syncs for the
same consumer at once.

## Pilot record

ES9.2 (2026-10-27) ran `verify`, `sync --dry-run`, and two real `sync` runs against `ecosystem-assets`. All
reported the two ES5 links as owned and correct and changed nothing; inode and timestamps of the links and skill
directories were identical before and after.

First new activation, ES9.3 (2026-10-27): `verification-before-completion` assigned to `playnest` and synced
into `web-playnest` (4 directories and 2 relative symlinks, nothing else). `skills:verify` passed, a second sync was a
no-op, and fresh Claude Code and Codex sessions from the Playnest root each loaded the linked `SKILL.md` on an
explicit request (evidence `es93-*`). Natural triggering and behavioral effect were not part of this rollout.

## Not covered yet

Global activation, other agents (e.g. Cursor), Windows (junctions instead of symlinks), and pruning of copies.

## New machine or fresh clone

`external/` (installs, backups, `installed.json`) is git-ignored, so a fresh clone has no installed third-party skills even though
the registry and any committed or consumer-side links exist. Consumer links to `external/skills/<id>` then dangle, and
`pnpm skills:verify <consumer>` reports `not installed (run pnpm skills:install <id>)`. That is environmental, not a verifier
fault. Recover by reinstalling the approved skills the consumer uses, for example `pnpm skills:install grilling`,
`verification-before-completion`, `frontend-design`, `writing-plans` (each downloads the pinned commit, checks the reviewed content
hash and writes only under `external/`), then verify again. No link has to be recreated.

## Curated releases (ES18–ES21)

An assignment with `release: "x.y.z"` uses an approved curated release instead of the legacy upstream install. Such assignments are created and
changed only through `pnpm skills:library install|upgrade|rollback` (preview by default, `--apply` to act), which also copy the release into the
machine-local store `external/releases/` and track installs in `external/releases.lock.json`. `pnpm skills:library status <consumer>` shows
legacy vs curated, desired vs installed, drift, upgrades and rollback availability. `skills:sync` and `skills:verify` handle curated assignments
like any other. Moving a legacy install to a curated release needs `upgrade --migrate` and is reversible with `rollback --to legacy`. See
[library.md](library.md).
