# Private skills and ecosystem integrations (ES24)

ES25 extends this model with ownership and distribution policies (restricted public skills use the same private root and access
records); see [es25-ownership-distribution.md](es25-ownership-distribution.md).

## 1. Threat model (written before implementation)

**What must stay private:** the content of private skills and private releases, and their metadata: ids, names, descriptions,
source locations, provenance, reviews, approvals and consumer authorizations. The public repository, its registry and the website built
from it are public; everything committed there, including history, must be treated as published.

| #   | Threat                                                                                                                              | Control                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | A private record is added to `registry/*.json` and published with the next commit or deploy.                                        | Public validation rejects any record whose visibility is not `public`. Private records live in a separate private root outside this repository.                                                                                                                               |
| T2  | Private data reaches the website through catalog generation, bundles, HTML, source maps, search data or build logs.                 | The catalog generator reads only the public registry and never the private root, whatever the environment says. Exclusion happens before generation, not in the UI. A test builds the site with a private root configured and searches every output file for private markers. |
| T3  | Private entries are "hidden" by a client-side filter but still shipped.                                                             | No private record is ever in client data, so there is nothing to filter.                                                                                                                                                                                                      |
| T4  | The private root is misconfigured: inside the public repository (committable), a symlink, world-writable, or not a private root.    | The root must be configured explicitly (no default), absolute, a real directory (no symlink), outside this repository, owner-only (0700, since the ES25 audit), and marked with `ecosystem-skills-private.json`.                                                              |
| T5  | Path tricks inside the private root (symlinked registry files, `..` paths, symlinked library folders).                              | Registry files have fixed names and must be regular files; release folders reuse `verifyRelease` (canonical path, no symlinked component, containment, content hash).                                                                                                         |
| T6  | "It is local, so it is trusted."                                                                                                    | Private content goes through the same release rules as public content: content hash, security review recorded for that hash, owner approval. Nothing is approved automatically.                                                                                               |
| T7  | Over-broad access: every project or agent gets every private skill.                                                                 | Explicit authorization per consumer, per skill, per version and per agent. No wildcards, no global consumers, no inheritance from repository membership or mapping.                                                                                                           |
| T8  | A private id shadows a public skill.                                                                                                | Ids must be unique across public and private records.                                                                                                                                                                                                                         |
| T9  | CLI output or errors print sensitive metadata.                                                                                      | Commands print ids, names and statuses to the local terminal only; the private root path is shown as `<private root>`; descriptions and source locations of private skills are not printed.                                                                                   |
| T10 | Installed private skills leak through a consumer repository (a committed `.claude/skills/<id>` link reveals the id and store path). | The install preview warns; the owner decides per consumer. Consumer repositories should git-ignore agent skill links for private skills.                                                                                                                                      |
| T11 | Local filesystem access control is mistaken for security.                                                                           | Documented limitation: any process running as the owner, including any agent in any project, can read the private root. Authorization controls what this tool installs, not what a local process can read.                                                                    |

Everything below is **implemented** unless it is marked _planned_.

## 2. Public and private skills

| Visibility | Where it lives                                                         | On the website     |
| ---------- | ---------------------------------------------------------------------- | ------------------ |
| `public`   | `registry/*.json` in this repository (absent visibility = public)      | Yes                |
| `private`  | the private root's `registry/` (absent visibility = private there)     | Never, in any form |
| `local`    | the private root's `local/skills.json`; metadata for this machine only | Never              |

Visibility applies to skills, sources and curated releases, and it is **independent** of discovery, security review, approval, content
availability and installation. A private skill is not approved because it is private or local. An approved private release is not
available to any consumer until that consumer is authorized. A private release must belong to a private skill: a private copy of a public
skill is registered as its own private skill (its id must differ), because a public assignment would otherwise reveal the private version.

How exclusion works: `pnpm catalog:validate`, `pnpm catalog:build` and the website build call the public loader, which reads only
`registry/*.json` and **rejects** any record whose visibility is not `public`. They never read the private root, whatever the environment
says. Nothing private is filtered out in the browser, because nothing private is ever there.

## 3. Private storage

There is no default location and nothing is created automatically (no repository, no folder). The owner configures one:

```sh
export ECOSYSTEM_SKILLS_PRIVATE_ROOT=/absolute/path/to/private-skills   # or, in the git-ignored private.local.json:
echo '{ "root": "/absolute/path/to/private-skills" }' > private.local.json
```

The directory must be absolute, real (not a symlink, no symlinked parent), outside this repository, not a filesystem root or the home
directory, owned by you and accessible by nobody else, and contain `ecosystem-skills-private.json` (`{ "schemaVersion": 1 }`). Since the
ES25 audit remediation the root, `registry/` and `local/` must be `chmod 700` and every record file `chmod 600` (group or other read, write
or traverse permission is refused), and the tool writes access records, the lock and store folders with those modes, including when it
undoes a failed change. These are POSIX permission checks; on platforms without them (Windows) a private root cannot pass and private
features stay off.
A separate private Git repository checked out anywhere is a good fit; its layout mirrors this repository:

```
ecosystem-skills-private.json
registry/skills.json      private skills (same schema as registry/skills.json)
registry/sources.json     private sources
registry/releases.json    private curated releases (same schema and rules as registry/releases.json)
registry/access.json      consumer authorizations
local/skills.json         machine-local metadata (git-ignore local/ in the private repository)
library/<skill>/<version> private release content
external/                 machine-local store and lock for private installs (git-ignore it too)
```

Safety: registry files have fixed names and must be regular files in plain directories; release folders are checked by the same
`verifyRelease` as public ones (canonical path, no symlinked component, containment, content hash, SKILL.md present); writes are atomic
and journaled; private ids may not collide with public ones. A private skill is a normal skill record: first-party (content authored in
the private root) or external with a pinned upstream revision.

## 4. Visibility, approval and authorization

| Question                                                    | Answered by                                         |
| ----------------------------------------------------------- | --------------------------------------------------- |
| Can the public see it?                                      | `visibility`                                        |
| Is this exact content reviewed?                             | the release's `review` (bound to `curatedHash`)     |
| Did the owner approve it?                                   | the release's `approval`                            |
| May this project use it, which versions, with which agents? | `registry/access.json` in the private root          |
| Does it work with an agent?                                 | `supportedAgents` and evidence (unchanged)          |
| Can it be installed now?                                    | all of the above, plus the library and store checks |

An access record:

```json
{
  "consumer": "playnest",
  "skill": "my-private-skill",
  "agents": ["claude-code"],
  "releases": ["1.0.0", "1.1.0"],
  "release": "1.0.0",
  "activeAgents": ["claude-code"],
  "authorizedBy": "Owner",
  "authorizedAt": "2026-10-31"
}
```

Access records also authorize restricted public skills (ES25), and owner-only skills additionally require an owner-controlled
consumer. `releases` and `agents` are explicit lists: there are no wildcards, global consumers cannot be authorized, and nothing is inherited from
repository membership, project mappings or approval. `release` is the desired version and `activeAgents` the agents actually activated for
it; the install, upgrade and rollback commands write both (`activeAgents` comes from the agents requested, never from `agents`). Upgrade
and rollback move every active agent together. Removing an agent from `agents` (revocation) blocks every further change for that skill and
consumer and is shown by `skills:library status`; it does **not** remove the existing link, which the owner removes by hand.
Removing every grant (or the whole record) works the same way: the install stays listed by `status` from its deployment tracking, as
`authorization: revoked`, with the links it left. Install
previews, errors and results name the private root only as `<private root>`. The owner writes access records by hand; there is deliberately no command that grants access.

**Limitations of local access control:** authorization decides what this tool installs. It is not operating-system security: any program
running as the owner, including any agent session in any project, can read the private root. Keep secrets out of skills entirely. Agent
skill links in a consumer repository reveal a private skill's id and point into the private root, so keep those links out of the consumer's
Git history (the install preview says so).

## 5. Private release lifecycle

The ES18–ES23 engine is reused unchanged in its safeguards:

```sh
pnpm skills:library install  <consumer> <private-skill> --version 1.0.0 --project <dir>            # preview
pnpm skills:library install  <consumer> <private-skill> --version 1.0.0 --project <dir> --apply
pnpm skills:library upgrade  <consumer> <private-skill> --to 1.1.0 --project <dir> [--apply]
pnpm skills:library rollback <consumer> <private-skill> --to 1.0.0 --project <dir> [--apply]
```

For a private skill: content comes from the private library, the store and lock live in the private root's `external/`, and the desired
state is the access record (never `registry/consumers.json`). Blockers include everything for public releases (approval, a complete review
for the exact hash, library and store integrity, conflicts) plus: no access record, a version or agent that is not authorized. Authorizing
an unapproved version does not make it installable. Failures roll back the store, links, access record and lock.

`skills:library status` lists private and restricted installs when a private root is configured (ES25), including installs whose
authorization was revoked. **Manual cleanup after revocation** (nothing does it automatically): for each link `status` reports, check that
it is a symlink into `<private root>/external/releases/<skill>/` (`ls -l <project>/.claude/skills/<skill>`, likewise
`.agents/skills/<skill>`) and remove only that symlink (`rm <project>/.claude/skills/<skill>`, never `rm -r`). The store copy and the
tracking history in the private root may stay (they are history and allow a later reinstall); delete a store folder only together with
its `store` entry in `external/releases.lock.json`, by hand. _Planned:_
`skills:library prepare` downloads public GitHub sources only (a private upstream needs its content staged by hand with `stage`-like
copying into the private library, then a review).

## 6. Ecosystem Assets integration

First-party skill `skills/shared/ecosystem-assets` (public, unreviewed, not approved). It teaches agents to search the Ecosystem Assets
catalog before creating assets, prefer exports, check `rightsStatus` and `publication`, choose variants, and never edit or copy assets
on their own. It relies only on the documented contract, which it reads inside an authorized checkout (since ES25 the public copy
describes the approach only and restates none of the private repository's documentation), and contains no asset inventory, paths or
binaries. Since ES25 it is FM Ecosystem-owned, public and restricted to owner-only managed installs. Registry: integration `ecosystem-assets` (type `asset-catalog`, private
repository, named but never linked).

## 7. Ecosystem Config integration

First-party skill `skills/shared/ecosystem-config` (public, unreviewed, not approved; since ES25 FM Ecosystem-owned and restricted to
owner-only managed installs). Ecosystem Config is the project/deployment
registry: it publishes `dist/ecosystem.json` and a consumer contract. It does **not** publish shared TypeScript, ESLint, Prettier, test or
CI configuration packages, so the skill does not invent them: it points agents at each project's own setup and gives stable
configuration profile ids (`references/profiles.md`) that say which topics have a shared source today. It recommends only; it never edits
the configuration, installs dependencies or rewrites project config.

**Repository name and rename:** everything refers to the integration id `ecosystem-config`. The repository name appears once, in
`registry/integrations.json`:

```json
"repository": { "name": "ecosystem-config", "formerNames": ["config-ecosystem"], "visibility": "public", "url": "https://github.com/Fikrimarzuki/ecosystem-config" }
```

The rename happened before ES25, which updated exactly this record and the homepage (see es25-ownership-distribution.md §10).
Checkouts under either name keep resolving; a test performs exactly this change on a fixture.

## 8. Project mappings

`registry/consumers.json` remains the only project registry. A consumer may carry `ecosystem`:

```json
"ecosystem": { "project": "playnest", "sources": ["ecosystem-config"] }
```

`project` is the project's id in Ecosystem Config, which Ecosystem Assets also uses as `projectId`. Recorded only where the sources confirm
it (checked on 2026-10-30): FM Studios (`fmStudios`), Gateway (`gateway`, plus assets), Playdeck (`playdeck`), Playnest (`playnest`);
Hearthside syncs Ecosystem Config but has no project record; Momee's assets sit under an intake label with the registry id pending. A
mapping grants no permission to read, edit or install anything and never changes assignments.

## 9. CLI

```sh
pnpm skills:visibility [<skill>]      # skills in this local context: visibility, review, releases, who may use them
pnpm skills:map [<consumer>]          # projects: skills, Ecosystem Config project, asset and config sources
pnpm skills:map [<consumer>] --validate   # check local checkouts, documented files and project ids (read-only)
```

Both are read-only. They print ids, names and statuses; never the private root's path, private descriptions or source locations. Source
checkouts are found next to this repository under the repository's current or former name, or through the git-ignored
`sources.local.json` (`{ "ecosystem-config": "../path" }`).

## 10. Public website

Shows public skills only. The two integration skills have an "Ecosystem integration" section: integration type, source repository (linked
only when public), documented interface, mapped projects, permissions required and compatibility. The overview has a generic "Private
skills" note. A test builds the production site, with source maps, while a private root is configured, and searches every output file and
the build log for private markers.
