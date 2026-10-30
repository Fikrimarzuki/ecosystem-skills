# Registry reference

`registry/*.json` is the single source of truth. The site build validates it and generates the normalized
`catalog.json` (sorted, no timestamps, byte-identical for identical input) into `apps/web/dist`; see
[deployment.md](deployment.md). `pnpm catalog:build` writes the same file to the git-ignored
`apps/web/public/catalog.json` for inspection.
Unknown fields are rejected, so nothing unreviewed can leak into the public catalog.

## `skills.json`

Array of skills. Key fields (schema: `packages/catalog/src/schema.ts`):

- `id` (kebab-case, unique), `name`, `description`, `category`, `tags`. `category` is a free-form topic. The
  website groups it into six browsing groups with an explicit table (see [website.md](website.md)); a new category
  needs an entry there.
- `origin`: `first-party` | `external` — must match `source.type`
- `source`
  - first-party: `{ "type": "first-party", "path": "skills/shared/<id>" }` (repo-relative)
  - external: `{ "type": "external", "upstream": { "url" }, "fork"?: { "url" }, "path", "revision" }`.
    `upstream` is always the original project; a `fork` is recorded separately. `path` is the skill folder
    inside the repository (safe relative path). `revision` is a full 40-character commit SHA.
  - A skill whose SKILL.md sits at the repository root (a few upstreams do this) uses `"path": "."`. Only external
    skills may; the pin then covers the whole repository, and `pnpm skills:install` refuses it until a subset is chosen.
- `author`, `license` — required for external skills (`"unknown"` if upstream states none; never guess)
- `version`, `agents` (`claude-code` | `codex` | `cursor`; for external skills, as documented upstream —
  not verified by us), `requires` (integration ids), `requiresSkills` (skills it explicitly invokes), `docs`
- `review`: `{ status, reviewedAt?, reviewer?, approvedBy?, revision?, contentHash?, findings[], notes? }`
  - `unreviewed` (discovered) → `reviewed` (findings recorded, no decision) → `approved` | `rejected` (owner)
  - any status other than `unreviewed` needs `reviewedAt` and `reviewer`
  - external `reviewed`/`approved` must carry `revision` equal to `source.revision` and the `contentHash` of the
    reviewed folder; changing the pin forces a re-review
  - `approved` needs `approvedBy` (never set automatically) and all `requiresSkills` approved

- `discovery` (optional, external only; added by ES16): how a candidate entered the registry —
  `{ discoveredAt, outcome, source, contentHash, warnings[], dependencies[], audit }`. `outcome` is
  `register-for-review` or `register-with-warnings` (which requires at least one warning). `source` is an id in
  `sources.json` that lists this skill. It is a metadata and file scan, not a review: the review status stays
  `unreviewed`, and a discovery record never implies approval, installation or activation.
  `approvalBlockers[]` (ES16.1) lists conditions that must be resolved before approval (a repository-root SKILL.md, missing
  sibling skills, an unreviewed downloaded binary, an unconfirmed licence). While any remain the skill cannot be approved
  or installed; clearing them is a deliberate edit that must come with review findings. Validation also requires: an
  approved skill with discovery warnings has review findings; a review of the pinned revision hashes to the discovery hash;
  an approved skill is not a repository-root skill; and `register-for-review` carries no warnings. Candidates carry an
  explicit `"review": { "status": "unreviewed", "findings": [] }`.

Approval is a registry fact; **installation and activation are not**. They are machine-local, so they are neither in
the registry nor in the public catalog; see [external-skills.md](external-skills.md) and [consumers.md](consumers.md).

## `sources.json`

Repositories, applications, standards and leads that were examined (ES16). A source is not a skill; it records what a
name resolved to and what was decided. Fields: `id`, `name`, `requestedAs?`, `batch` (`original` | `design-ui` |
`video-animation` | `discovered`), `kind` (`skill` | `skill-collection` | `framework` | `application` |
`design-reference` | `standard` | `lead`), `resolution` (`verified` | `ambiguous` | `unresolved`), `decision`
(`register-for-review` | `register-with-warnings` | `reference-only` | `unresolved` | `reject`), `upstream?`,
`revision?` (the commit examined), `publisher?`, `license?`, `lastCommit?`, `skillsFound`, `skills[]` (registered
skill ids), `summary`, `warnings[]`, `alternatives[]` (other candidates considered), `needs?`, `discoveredAt`.

Rules enforced by validation: a verified source needs `upstream`; a source that registers skills needs `revision` and at
least one listed skill, and every listed skill must come from the same upstream; `reference-only`, `unresolved` and
`reject` sources list no skills; a non-verified source must be `unresolved` or `reject`, carries no `revision`, and an
`unresolved` one must say what would resolve it (`needs`); a source with any skill registered _with warnings_ must itself
be `register-with-warnings`. See [es16-discovery.md](es16-discovery.md) for the ES16 results.

## `releases.json`

Curated releases (ES17): locally stored, versioned copies under `library/<skill>/<version>/`. One record per release:
`skill`, `version` (semantic), `createdAt`, `path`, `upstream` `{ url, path, revision, contentHash }` (absent only for a
first-party skill), `curatedHash`, `license`, `attribution`, `modifications[]` `{ kind, path, summary, why,
affectsBehavior, affectsDependencies, affectsPermissions }`, `review` `{ outcome, reviewer?, reviewedAt?, scope?, checks[],
evidence[], notes? }`, `approval` `{ status: unapproved | approved | withdrawn, approvedBy?, approvedAt? }`,
`supportedAgents[]`, `dependencies[]`, `restrictions[]`, `notes?`. A release is not an approval and is never created
automatically. A skill may also carry `curation` `{ state: pending | blocked, reason, updatedAt }` while it has no release.
A release review also records the `contentHash` it covered (equal to `curatedHash`). All rules, including the security-review requirements and immutability, are in [library.md](library.md).

## `evaluations.json` (ES19)

Comparative evaluation records: `id`, `skill`, `kind` (`static-assessment` | `agent-run`), `date`, `assessor`, `revision`, `contentHash`,
`scope`, `security[]`, `compatibility[]`, `strengths[]`, `weaknesses[]`, `measurements[]` `{ name, value, unit, method }`,
`comparison` `{ status: not-run | run, alternative?, summary }`, `evidence[]` (ids in evidence.json), `recommendation`
(`prioritize-review` | `review` | `static-only` | `not-recommended` | `keep-approved`), `blockers[]`, `notes?`. A static assessment cannot
claim a run or cite run evidence; an agent run must cite evidence for the skill or its alternative; a recommendation is never an approval.

## `updates.json` (ES20)

One upstream check per external skill: `skill`, `checkedAt` (ISO date-time, when this repository looked), `pinnedRevision`,
`latestRevision?`, `latestCommitDate?`, `status` (`up-to-date` | `update-available` | `review-required` | `source-unavailable` |
`check-failed`), `latestContentHash?`, `changes?` (added/removed/changed, kinds, security-sensitive list), `detail`. A skill without a record is
"never checked". Written only by `pnpm skills:library check-upstream --write`.

## `consumers.json`

Projects (`kind: "project"`) and global setups (`kind: "global"`). Each has `agents` and `assignments`:
`{ skill, agents, install, verification }`. `install` is `symlink` (default) or `copy`. An assignment is
**desired state** (per agent), and only approved external skills may be assigned (registry validation, as well as the `assign` command). An assignment may pin a curated release with `release: "x.y.z"` (ES18): the release must be installable (approved, clean review, no blockers), the install mode must be `symlink`, and the canonical copy is the verified store folder `external/releases/<skill>/<version>`. `verification` defaults to `unverified`; `verified` is rejected unless
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
evidence requires the skill to have been invoked in every treatment run. Agents that do not expose their skill list (Codex) may record `discovery: "not-tested"` on a natural-trigger record
only if another record for the same skill, agent and revision shows discovery passing.

`verified` requires all three checks to pass, and `partial` requires discovery to pass. Evidence whose revision
differs from the current pin is shown as **stale**. Evidence is not a consumer assignment: it says an agent can use
the skill, not that a project does.

## Checks performed

Schema/required fields, unique ids, skill→integration and consumer→skill references, agent
consistency, external-skill provenance, review/verification evidence rules, and rejection of absolute
local paths, `file://` URLs, credentials and common token formats.
