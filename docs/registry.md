# Registry reference

`registry/*.json` is the single source of truth. `pnpm catalog:build` validates it and writes the
normalized `apps/web/public/catalog.json` (sorted, no timestamps, byte-identical for identical input).
Unknown fields are rejected, so nothing unreviewed can leak into the public catalog.

## `skills.json`

Array of skills. Key fields (schema: `packages/catalog/src/schema.ts`):

- `id` (kebab-case, unique), `name`, `description`, `category`, `tags`
- `origin`: `first-party` | `external` — must match `source.type`
- `source`
  - first-party: `{ "type": "first-party", "path": "skills/shared/<id>" }` (repo-relative)
  - external: `{ "type": "external", "upstream": { "url" }, "fork"?: { "url" }, "path", "revision" }`.
    `upstream` is always the original project; a `fork` is recorded separately. `path` is the skill folder
    inside the repository (safe relative path). `revision` is a full 40-character commit SHA.
- `author`, `license` — required for external skills (`"unknown"` if upstream states none; never guess)
- `version`, `agents` (`claude-code` | `codex` | `cursor`; for external skills, as documented upstream —
  not verified by us), `requires` (integration ids), `requiresSkills` (skills it explicitly invokes), `docs`
- `review`: `{ status, reviewedAt?, reviewer?, approvedBy?, revision?, contentHash?, findings[], notes? }`
  - `unreviewed` (discovered) → `reviewed` (findings recorded, no decision) → `approved` | `rejected` (owner)
  - any status other than `unreviewed` needs `reviewedAt` and `reviewer`
  - external `reviewed`/`approved` must carry `revision` equal to `source.revision` and the `contentHash` of the
    reviewed folder; changing the pin forces a re-review
  - `approved` needs `approvedBy` (never set automatically) and all `requiresSkills` approved

Installation state is not in the registry; see [external-skills.md](external-skills.md).

## `consumers.json`

Projects (`kind: "project"`) and global setups (`kind: "global"`). Each has `agents` and `assignments`:
`{ skill, agents, install, verification }`. `install` is `symlink` (default) or `copy`. An assignment is
**desired state** (per agent). `verification` defaults to `unverified`; `verified` is rejected unless
`verifiedAt` and `method` record how it was checked. For external skills `verification.revision` is required;
when it differs from the pinned `source.revision`, the website marks the verification **stale** (update impact).
Global agent assignments use a `kind: "global"` consumer.

## `integrations.json`

`type`: `mcp-server` | `cli-tool` | `dependency`, plus `description`, optional `homepage`, `license`,
and `transport` (MCP only). Deliberately no commands, env vars or paths: those are machine-specific
and may carry secrets. Skills reference integrations via `requires`.

## `evidence.json`

Agent compatibility evidence from real agent runs: one record per skill × agent run.

- `id`, `skill`, `agent`, `agentVersion`, `date`
- `context`: a description without machine paths
- `task`: the harmless task used
- `revision`: required for external skills
- `contentHash`
- `discovery` / `instructions` / `invocation`: `pass` | `fail` | `not-tested`
- `result`: `verified` | `partial` | `failed`

Natural-trigger evaluations (ES8) add `trigger: "natural"`, `scenario`, `fixture`, `environment`, `commands`, and `trials`:
`{ treatment: { runs, invoked, passed, partial, failed, inconclusive }, control?: { runs, passed, partial, failed,
inconclusive } }`. Controls carry no `invoked` count, because a control run is never an invocation. `verified` natural
evidence requires the skill to have been invoked in every treatment run.

`verified` requires all three checks to pass, and `partial` requires discovery to pass. Evidence whose revision
differs from the current pin is shown as **stale**. Evidence is not a consumer assignment: it says an agent can use
the skill, not that a project does.

## Checks performed

Schema/required fields, unique ids, skill→integration and consumer→skill references, agent
consistency, external-skill provenance, review/verification evidence rules, and rejection of absolute
local paths, `file://` URLs, credentials and common token formats.
