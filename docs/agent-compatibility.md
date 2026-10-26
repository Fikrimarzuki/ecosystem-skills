# Agent compatibility (ES2)

Test date: 2026-10-26 · macOS (Darwin 25.6, arm64) · Claude Code **2.1.310** (VS Code extension binary) ·
Codex CLI **0.164.0**.

Legend: **[E]** confirmed by executing the agent · **[D]** confirmed by documentation or binary strings only ·
**[L]** confirmed by local filesystem inspection · **[N]** not verified.

## Canonical layout

One canonical copy lives in `skills/shared/<id>/` (or `skills/projects/...` later). Consumers get a
**relative symlink** to it. Skill instructions use paths relative to the skill folder only; no absolute
paths appear in canonical content.

## Claude Code

| Item                                                         | Result                                                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Project skills in `.claude/skills/<id>/`                     | **[E]** discovered (listed in the session init skill list)                                                                          |
| Project skills in `.agents/skills/`                          | **[E]** **not** discovered                                                                                                          |
| Symlinked skill folder (relative, same repo)                 | **[E]** discovered, instructions + reference + script worked                                                                        |
| Symlink to another repo, consumer outside the canonical repo | **[E]** works from consumer root and from a nested subdirectory                                                                     |
| Dangling symlink in `.claude/skills`                         | **[E]** ignored silently; no crash                                                                                                  |
| Personal skills `~/.claude/skills/<id>/`                     | **[D]** documented; directory exists locally **[L]** (contains an unrelated `synced` folder); **[N]** not tested                    |
| Collision precedence                                         | **[D]** enterprise > personal > project; plugin skills are namespaced; nested ones load by path. **[N]**                            |
| Parent-directory discovery                                   | **[D]** project skills load from the start directory and parents up to the repo root; **[E]** consistent with the subdirectory test |

## Codex

| Item                                               | Result                                                                                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo skills in `.agents/skills/<id>/`              | **[E]** discovered; neutral listing prompt named the skill                                                                                                                  |
| Repo skills in `.claude/skills/`                   | **[E]** **not** discovered (negative control)                                                                                                                               |
| Symlinked skill folder (same repo, and cross-repo) | **[E]** works; from root and from a nested subdirectory                                                                                                                     |
| Dangling symlink                                   | **[E]** not offered as a skill; no crash                                                                                                                                    |
| User skills `$HOME/.agents/skills`                 | **[D]** documented. The directory does not exist locally. **[N]** not tested                                                                                                |
| `~/.codex/skills`                                  | **[L]** exists and holds only Codex's bundled `.system` skills; the binary also references it **[D]**. Treat as legacy/internal; use `$HOME/.agents/skills` for user skills |
| Admin `/etc/codex/skills`                          | **[D]** documented only                                                                                                                                                     |
| Symlink support in general                         | **[D]** "follows the symlink target when scanning"; **[E]** for project scope                                                                                               |
| Collisions                                         | **[D]** same-`name` skills are not merged; both may appear. **[N]**                                                                                                         |

The docs URL `developers.openai.com/codex/skills` redirected (308) to `learn.chatgpt.com/docs/build-skills`; the
redirect was followed for reading only.

## Reference and script resolution

- **[E]** Both agents read `references/...` and ran `scripts/smoke-test.sh` when the instructions said "relative to this
  skill's folder". Both agents used the link path (`<consumer>/.claude|.agents/skills/<id>/...`), not the canonical
  path, so skill content must never assume its own real location.
- **[E]** Running the script through the link from a different working directory works.
- **[E]** Claude Code's `-p` mode blocks the script unless the Bash call is allowed; the agent runs it by absolute path
  (e.g. `bash /abs/.../smoke-test.sh`), so allow rules should match the script name rather than a relative form.
- Codex ran inside a read-only sandbox without trouble for this no-write script.

## Compatibility matrix

| Mechanism               | Claude Code                 | Codex                          |
| ----------------------- | --------------------------- | ------------------------------ |
| Project dir             | `.claude/skills` **[E]**    | `.agents/skills` **[E]**       |
| Other agent's dir read? | `.agents/skills` no **[E]** | `.claude/skills` no **[E]**    |
| Symlink (in-repo)       | yes **[E]**                 | yes **[E]**                    |
| Symlink (cross-repo)    | yes **[E]**                 | yes **[E]**                    |
| Nested cwd              | yes **[E]**                 | yes **[E]**                    |
| Dangling link           | ignored **[E]**             | ignored **[E]**                |
| Global dir              | `~/.claude/skills` **[D]**  | `$HOME/.agents/skills` **[D]** |
| Global tested           | **[N]**                     | **[N]**                        |
| Collision handling      | documented **[D]**          | documented **[D]**             |

## Installation modes

**Project-local (verified).** In the consumer repo create `.claude/skills/<id>` and `.agents/skills/<id>` as relative
symlinks to the canonical folder. Relative links only resolve if both repos keep the same relative layout (siblings
under `porto-projects/`); otherwise the link is machine-specific and must not be committed. Check with
`pnpm skills:links <project-dir>` (read-only; reports `linked`, `copy`, `broken`, `wrong-target`, `missing`; it checks
links, it does not prove discovery).

**Global (not verified, not performed).** Same links under `~/.claude/skills` and `~/.agents/skills`. Global skills
cannot be relative to a repo, so they would be absolute and machine-specific. Whether they coexist with project
skills is documented for Claude Code (precedence rules) but **[N]** for both agents. Nothing was installed globally
and no global configuration was changed.

**Copy fallback.** `install: "copy"` in the consumer mapping, for hosts where symlinks are unreliable. Not tested.

## Codex sandbox and native tools (found in ES3)

**[E]** Inside Codex's macOS sandbox (`codex exec -s workspace-write`, or `codex sandbox -P :workspace`), Inkscape
aborts (`Abort trap: 6`) and Playwright's Chromium cannot launch. The pre-migration Momee scripts behave identically,
so this is a sandbox limitation, not a skill-layout problem. Plain Node scripts work. Skills that drive GUI-toolkit
binaries need Codex approval to run those steps outside the sandbox. Claude Code ran the same steps without issue.

## macOS findings

Relative symlinks, including ones that climb out of the repo into a sibling directory, resolve for both agents.
The temp consumer was in a git-initialised directory under `/private/tmp`. `timeout` is not available on macOS.
`codex exec` waits on stdin unless it is redirected (`< /dev/null`).

## Windows considerations — **[N]**, not tested

Symlink creation needs Developer Mode or elevated rights; git needs `core.symlinks=true` to check out committed links
(otherwise they become text files). Directory junctions or a copy fallback may be needed, and POSIX `.sh` scripts
need a shell (Git Bash/WSL). Treat Windows as unsupported until tested.

## Known limitations

- Single machine, single run per case (LLM-driven, so some variance is possible). Codex discovery in the cross-repo
  case was additionally confirmed with a neutral listing prompt.
- Only one skill type tested (SKILL.md + reference + shell script). No external skills, no MCP-dependent skills.
- Collisions, global scope, `$HOME/.agents/skills`, Cursor and Windows are untested.
- `agents: ["claude-code", "codex"]` on the smoke-test skill reflects the tests above.
- Review status of the smoke-test skill remains `unreviewed`.

## Recommended adapter strategy

1. Keep canonical skills agent-neutral (`SKILL.md` + relative `references/` and `scripts/`).
2. An adapter is a tiny table, not a framework: agent → project dir (`PROJECT_SKILL_DIRS` in
   `packages/catalog/src/links.ts`) and, later, global dir.
3. Install = create relative symlinks per assignment; activation stays a separate, explicit step.
4. Keep verification evidence in the consumer registry (method, date, agent versions) and any machine-specific
   detail (absolute paths, results) in a local, git-ignored file, never in the public catalog.
5. Re-verify when agent versions change.
