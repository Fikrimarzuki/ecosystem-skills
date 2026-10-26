# ES3 — `momee-character-art` migration record

Date: 2026-10-26 · macOS arm64 · Claude Code 2.1.310 · Codex CLI 0.164.0 · Inkscape 1.4.4 · Node 24.21.0 ·
playwright-core 1.64.0 (in ecosystem-assets).

Status: **complete.** Candidate verified in ES3; consumer switch performed and verified in **ES5 on 2026-10-26**
(switch at 15:17 UTC).

## 1. Source and canonical locations

|                     | Path (relative to `porto-projects/`)                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Canonical (live)    | `ecosystem-skills/skills/projects/momee/momee-character-art/`                                    |
| Codex adapter       | `ecosystem-assets/.agents/skills/momee-character-art` → symlink to canonical (ES5)               |
| Claude Code adapter | `ecosystem-assets/.claude/skills/momee-character-art` → symlink to canonical (ES5)               |
| Preserved original  | `ecosystem-assets/.agents/momee-character-art.pre-es5/` (untracked; outside both discovery dirs) |
| Off-repo backup     | `porto-projects/_backups/es5-momee-character-art-20261026T151713Z/`                              |
| Before ES5          | original was a real directory at `.agents/skills/…`; `.claude` link pointed to it                |

## 2. Source inventory (SHA-256, at copy time)

| Mode         | SHA-256                                                            | File                                | Copy                  |
| ------------ | ------------------------------------------------------------------ | ----------------------------------- | --------------------- |
| `-rw-r--r--` | `3520963c8ac82193b1573ca50b859fd14fe490a280820fb7c7bf9ce23580f49e` | `SKILL.md`                          | changed (portability) |
| `-rw-r--r--` | `c623622224a325eb0cafbd96670455c743db98e28e6a6747d87af96be74d20b7` | `references/animation-readiness.md` | identical             |
| `-rw-r--r--` | `e289d27cf2dff8f7d93286861e98eb47d348e34d44d82a8b09b10a3fec1048ec` | `references/evidence.md`            | identical             |
| `-rw-r--r--` | `8316294745a7de570f2e2e353637d8e85b8e48a4d39572bf0003fd83539c9f26` | `references/facial-design.md`       | identical             |
| `-rw-r--r--` | `71f065d852645d91c176c7334dd88627be27dbbc551a1b24435957d84fdf1746` | `references/hair-design.md`         | identical             |
| `-rw-r--r--` | `03db75ff05578f146a98d7b83ac9bb8e65b68a00e7c0913565aaeb40cb70adca` | `references/style-guide.md`         | identical             |
| `-rw-r--r--` | `1afb63bfec1647149a02978ce104b79eadfebcab9bd7d22b0ed365e9acc374f1` | `references/svg-techniques.md`      | changed (portability) |
| `-rw-r--r--` | `330e6591918e3b05036e28b50518bf78b3626fb35701fa3d1c0d67719aa55cb5` | `references/visual-review.md`       | identical             |
| `-rwxr-xr-x` | `12e6cc91c730155a87c535936b6231577e29d308ae08afa4b5fbd12eb443463e` | `scripts/check-svg.mjs`             | identical             |
| `-rwxr-xr-x` | `4b2211a9a290eead3d9a1b731b2e785a04624065bcef812ff97e4ceb68ba319b` | `scripts/compare-sheet.mjs`         | changed (portability) |
| `-rwxr-xr-x` | `877c53328708c864c256e96fea73fc6de45613867e8e1dfe919b15da41ddda78` | `scripts/export-png.sh`             | changed (portability) |

Copied with `cp -Rp` (modes, mtimes, xattrs). Immediately after copying, all 11 hashes and modes matched and
`diff -r` was clean. No artwork or generated media was copied. The original was re-hashed afterwards and is unchanged.

## 3. Intentional differences (portability only; no artistic guidance changed)

| File                           | Change                                                                                                                                                                                                                                                                 | Why                                                                                                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/compare-sheet.mjs`    | Replaced `import("../../../../scripts/lib/render.mjs")` with a lookup: `$ECOSYSTEM_ASSETS_ROOT`, else walk up from the current directory to the `ecosystem-assets` root (identified by `package.json` name + `scripts/lib/render.mjs`). Clear exit-2 errors otherwise. | The old path only worked when the script physically lived at `ecosystem-assets/.agents/skills/<id>/scripts/`. Node resolves the main script through symlinks to its real path, so the old import would break after the move even when invoked through a link. |
| `scripts/export-png.sh`        | Inkscape is `$INKSCAPE`, else `inkscape` on `PATH`, else the macOS app bundle path.                                                                                                                                                                                    | Removes the hard dependency on one install location while keeping the existing zero-config behaviour on this Mac (Inkscape is not on `PATH` here).                                                                                                            |
| `SKILL.md`                     | Added two sentences: work from inside `ecosystem-assets`; `compare-sheet.mjs` finds the repo from there or from `ECOSYSTEM_ASSETS_ROOT`; `<skill>` means the folder as loaded.                                                                                         | States the working-directory convention explicitly now that the skill lives elsewhere.                                                                                                                                                                        |
| `references/svg-techniques.md` | Inkscape resolution order; "in the repository" → "in the `ecosystem-assets` repository".                                                                                                                                                                               | Same as above; removes ambiguity.                                                                                                                                                                                                                             |

Unchanged on purpose: `references/style-guide.md` refers to `app-momee/docs/...` as a sibling repository. That
remains true relative to the documented working directory.

`skills/` is excluded from Prettier and ESLint in this repo so skill content stays byte-stable.

## 4. Verification (isolated temp consumer)

A git-initialised temp directory outside every repo, with `.claude/skills/momee-character-art` and
`.agents/skills/momee-character-art` as relative symlinks to the new canonical folder. Fixture SVGs and the committed
v1 PNG were **copied** into it. All outputs went to the temp directory.

### Direct tool parity (new canonical via link, cwd = nested subdirectory)

| Check                                                                             | Result                                                                                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `check-svg.mjs` on eye test + v1 head                                             | Output **identical** to the original script's (eye: duplicate `iris`; head: duplicate `neck, blush` — known, pre-existing). |
| `xmllint --noout` on fixtures                                                     | Well-formed.                                                                                                                |
| `export-png.sh` v1 head                                                           | **Byte-identical** to the committed `mom-head-v1.png` (same as the original script's export).                               |
| `export-png.sh` eye; overwrite guard; bad `INKSCAPE`                              | Works; guard exits 2; clear error exits 2. No lingering Inkscape processes.                                                 |
| `compare-sheet.mjs` via `ECOSYSTEM_ASSETS_ROOT`                                   | Sheet **byte-identical** to the original script's sheet for the same inputs; inspected visually.                            |
| `compare-sheet.mjs` via walk-up (cwd inside ecosystem-assets, outputs in scratch) | Byte-identical.                                                                                                             |
| `compare-sheet.mjs` outside ecosystem-assets without env / with wrong env         | Clear error, exit 2. Overwrite guard works.                                                                                 |

### Agents

| Check                    | Claude Code 2.1.310 (`-p`)                        | Codex 0.164.0 (`exec`)                                                |
| ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------- |
| Discovery, consumer root | Listed in session init; loaded via the Skill tool | Loaded from `.agents/skills/…`; `realpath` = new canonical            |
| Discovery, nested cwd    | Listed                                            | Listed (neutral prompt)                                               |
| Reference loading        | Quoted `hair-design.md` correctly                 | Quoted `hair-design.md` correctly                                     |
| `check-svg.mjs`          | Ran; expected `duplicate id(s): iris`             | Ran; same                                                             |
| Inkscape export          | Ran; PNG identical to the direct export           | **Failed inside Codex's `workspace-write` sandbox** (`Abort trap: 6`) |
| Comparison sheet         | Ran (`ECOSYSTEM_ASSETS_ROOT` from environment)    | Not reached (no export); see below                                    |

Codex sandbox finding: run directly under `codex sandbox -P :workspace`, the **original** scripts fail exactly like the
migrated ones (Inkscape aborts; Chromium cannot launch). This is a pre-existing limitation of running GUI-toolkit
binaries inside Codex's macOS seatbelt sandbox, not a migration regression. Codex needs those steps approved to run
outside the sandbox. `check-svg.mjs` works inside the sandbox. Codex was not run unsandboxed in this test.

Claude Code `-p` mode required allow rules for the scripts. Compound shell commands were refused by the narrow allow
list, and the agent retried them as single commands.

## 5. Consumer switch (ES5, performed 2026-10-26)

ES3 recommended committing ecosystem-skills first. The owner chose not to commit yet, so ES5 also archived the
canonical copy in the off-repo backup.

### Preflight

- Original skill: 11 files, modes and SHA-256 identical to §2. `.claude` link unchanged (`../../.agents/skills/…`).
- Canonical copy: identical to the ES3 candidate (only the §3 changes).
- `ecosystem-assets` git status identical to ES3 (11 modified, 14 untracked entries, all unrelated Momee work).
  Content hashes of all 27 unrelated files were recorded before the switch and re-checked afterwards: unchanged
  except the one intended doc edit below.

### Backup (outside both repositories)

`porto-projects/_backups/es5-momee-character-art-20261026T151713Z/`:

| File                                                                   | Contents                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `original-momee-character-art.tgz`                                     | the original directory (`tar -czpf`, modes preserved) |
| `original.sha256-inventory.txt`                                        | mode, SHA-256, path for each of the 11 files          |
| `canonical-momee-character-art.tgz` + `canonical.sha256-inventory.txt` | the canonical copy at switch time (uncommitted)       |
| `archives.sha256`, `README.txt`                                        | archive checksums; restore note                       |

Verified before switching: both archives list and extract; extracted modes and hashes match the inventories, `diff -r`
against the live directories is clean, and the original archive matches §2.

### Switch performed

Targets were computed from real paths (`os.path.relpath(realpath(canonical), realpath(<link dir>))`); each step was
guarded (stop if the original was not a real directory, if `.pre-es5` existed, or if the `.claude` link differed).

| Path (in `ecosystem-assets`)          | Before                                               | After                                                                           |
| ------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `.agents/skills/momee-character-art`  | real directory                                       | symlink → `../../../ecosystem-skills/skills/projects/momee/momee-character-art` |
| `.claude/skills/momee-character-art`  | symlink → `../../.agents/skills/momee-character-art` | symlink → `../../../ecosystem-skills/skills/projects/momee/momee-character-art` |
| `.agents/momee-character-art.pre-es5` | —                                                    | the original directory (moved, unmodified)                                      |

Both links resolve (`realpath`) to `…/ecosystem-skills/skills/projects/momee/momee-character-art`.
The `.pre-es5` name replaces the `.pre-es3` name proposed in ES3.

### Verification after the switch (cwd = ecosystem-assets)

| Check                                                      | Result                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm skills:links <ecosystem-assets> momee-character-art` | `linked` for claude-code and codex                                   |
| Files through each link                                    | 11/11 readable via `.agents` and via `.claude`; 3 scripts executable |
| Preserved original                                         | `.pre-es5` matches §2 exactly                                        |
| `check-svg.mjs` (eye test + v1 head)                       | Output identical to the ES3 original-script baseline                 |
| `xmllint --noout`                                          | Well-formed                                                          |
| `export-png.sh` v1 head                                    | **Byte-identical** to committed `mom-head-v1.png`                    |
| `compare-sheet.mjs` (walk-up, no env var)                  | **Byte-identical** to the ES3 baseline sheet                         |

| Agent check      | Claude Code 2.1.310 (`-p`)                               | Codex CLI 0.164.0 (`exec -s read-only`)             |
| ---------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Discovery        | Listed exactly once in session init                      | Listed exactly once (neutral prompt)                |
| `SKILL.md`       | Loaded via the Skill tool                                | Read via `.agents/skills/…`; `realpath` = canonical |
| Reference        | Quoted `hair-design.md` correctly                        | Quoted `hair-design.md` correctly                   |
| SVG validation   | `FAIL`, `duplicate id(s): iris` (expected, pre-existing) | Same                                                |
| Inkscape export  | PNG identical to the ES3 eye export                      | Not attempted by the agent (read-only run)          |
| Comparison sheet | Generated without `ECOSYSTEM_ASSETS_ROOT`; inspected     | Not attempted by the agent                          |

Within Codex's own sandbox (`codex sandbox -P :workspace`, outputs in scratch): `check-svg` works; Inkscape aborts and
Chromium cannot start — the same known ES3 limitation, also seen with the original scripts. Not bypassed.

Agent outputs went to a scratch directory outside the repositories. No Momee artwork was written or changed.

### Rollback

```sh
cd porto-projects; A=ecosystem-assets
unlink $A/.agents/skills/momee-character-art
unlink $A/.claude/skills/momee-character-art
mv $A/.agents/momee-character-art.pre-es5 $A/.agents/skills/momee-character-art
ln -s ../../.agents/skills/momee-character-art $A/.claude/skills/momee-character-art
```

Then re-hash `$A/.agents/skills/momee-character-art` against §2. If `.pre-es5` is missing or differs, restore from
`_backups/es5-momee-character-art-20261026T151713Z/original-momee-character-art.tgz`
(`tar -xzpf … -C $A/.agents/skills`) and re-hash. Revert the two-line edit in `m1.1d-0-illustration-skills.md` and set
the registry assignment back to `unverified`.

### Remaining limitations

- The canonical skill and the registry are **uncommitted**; the off-repo archive is the only other copy until
  ecosystem-skills is committed.
- The relative links need `ecosystem-skills` as a sibling checkout. A standalone clone of ecosystem-assets gets
  dangling links, which both agents ignore silently.
- Sessions started outside ecosystem-assets need `ECOSYSTEM_ASSETS_ROOT` for `compare-sheet.mjs`.
- Codex cannot run Inkscape or Chromium inside its sandbox; those steps need approval outside it.
- `export-png.sh` uses macOS `stat -f` and `sips`. Windows and global (user-level) discovery are not verified.
- `.agents/momee-character-art.pre-es5` and the `_backups` folder should be removed only with the owner's approval,
  after a soak period.

### ecosystem-assets documentation

`projects/momee/styles/soft-storybook-adventure/docs/m1.1d-0-illustration-skills.md`: two lines changed (canonical
source, adapters). Nothing else in that file or in ecosystem-assets was edited.
