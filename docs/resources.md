# Resources, sources and skills (ES26)

Ecosystem Skills now holds three kinds of record. They are deliberately separate, and none implies another.

| Record       | File                      | What it is                                                                                                  | Can it be approved or installed?                                               |
| ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Skill**    | `registry/skills.json`    | An installable AI-agent instruction package (a `SKILL.md` folder), first-party or a third-party candidate   | Yes, only through the existing review, approval, curation and assignment steps |
| **Source**   | `registry/sources.json`   | One repository, website, standard or lead that was examined: who publishes it, licence, the pinned revision | No. A source is provenance, not a capability                                   |
| **Resource** | `registry/resources.json` | A classified item found in a source: an MCP server, toolkit, reference or developer resource                | **No, never.** There is no approval state, no installation and no assignment   |

Resources and sources never count toward the registered-skill total shown on the site.

## What belongs where

- **Skills** are `SKILL.md` capabilities an agent loads. They keep their whole lifecycle (discovered → reviewed →
  approved → curated → assigned → installed → verified); see [external-skills.md](external-skills.md) and
  [library.md](library.md).
- **Resources** are everything useful that is _not_ a skill, in five collections:

  | Category                  | Types                                                           | Examples                                              |
  | ------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
  | MCP servers               | `mcp-server`                                                    | Spec Kit MCP, Anti-Slop contrast MCP, Appllama MCP    |
  | Agent toolkits            | `cli-tool`, `workflow-kit`, `plugin-bundle`, `application`      | gstack, Claude Code Game Studios, ClaudeAnimationBase |
  | Agent development tools   | `framework`, `spec-toolkit`, `cli-tool`                         | Spec Kit, HyperFrames                                 |
  | Agent references          | `standard`, `documentation`, `curated-list`                     | The Agent Skills standard                             |
  | Other developer resources | `library`, `engine`, `creative-tool`, `application`, `cli-tool` | PlayCanvas, cannon-es, Sverchok, Effekseer, twigl     |

  The validator rejects a type that does not belong to its category.

- A repository can provide several items. It still has **one** source record (two sources with the same upstream are
  rejected); each item is its own resource pointing at that source. Example: `heygen-hyperframes` is one source
  that provides registered skills, the HyperFrames framework (agent development tool, "built for agents" upstream) and HeyGen's hosted MCP connector.

## MCP servers are not skills

An MCP server is a running service that exposes tools to an agent. A skill is text and files an agent reads. They are
catalogued differently:

- MCP resources must carry `mcp` metadata: where it runs (`local`, `remote`, `both`), transport, authentication, the
  tools it exposes and the permissions they imply, and the external data it reads or writes. `officialEndpoint` is
  recorded only when the publisher documents it.
- **Nothing connects to an MCP server.** The site shows an endpoint as text, never as a link or a control, and no
  command in this repository installs, starts or calls one. The skill installation process is not reused for MCP.

## Other developer resources (temporary)

Libraries, engines and creative tools that are useful to the owner but are not AI-agent capabilities live in the
`developer-resources` collection. On the site they are listed last, behind a dashed divider, with a note that they are
not skills. They have no dependency on skill installation state and never appear in skill counts or filters.

This collection may move to its own project later. It is designed for that:

- stable kebab-case ids that never change;
- every record names its source, so attribution and the pinned revision travel with it;
- `resources.v1.json` (below) exports each record with its provenance embedded, so it can be imported elsewhere
  without this repository's other files.

## Source verification requirements

A resource is `verified` only when its source is `verified`: the upstream identity is established by evidence (the
organisation or licence holder, the publisher's site linking the repository) and the newest commit was pinned by its
full SHA. The validator enforces this pairing and requires `lastVerified` on verified resources. Unresolved or
ambiguous identities stay unresolved and say what would settle them (`needs`). URLs, commits and licences are never
inferred; stars or popularity are not evidence of anything.

A resource can carry its own `license` when the source's licence does not cover it, for example a hosted service whose
repository holds only client configuration.

## Security review is not approval

Resources have a separate, three-state security field:

| `security.status` | Meaning                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `not-reviewed`    | Nothing has been looked at beyond identity                                                |
| `notes-recorded`  | Concerns were written down from a read-only look (install scripts, keys, scraping, hooks) |
| `reviewed`        | A security review was completed and its findings recorded (ES27: a complete `audit`)      |

Since ES27 a resource can carry a structured `security.audit` (completeness, scope, recommendation, findings with
evidence, pinned revision). A partial audit, for example of a hosted MCP server whose code cannot be read, keeps the
status at `notes-recorded`, shown on the site as "Concerns noted, not fully reviewed" with a "Review incomplete" badge.
The audit recommendation is advice, not an approval. See [es27-security-audit.md](es27-security-audit.md).

There is no `approved` state, by design: approval is a skill concept (per skill, per revision), and even a skill's
approval is not an installation. Discovered skills from the same sources stay `unreviewed` candidates until the owner
reviews them.

## AI-readable metadata

Every build emits, from the validated **public** registry only:

| File                 | Purpose                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/llms.txt`          | Orientation for AI agents ([llmstxt.org](https://llmstxt.org)): what the site is, the exact meaning of Discovered, Reviewed, Approved, Installable, Installed and Verified, stable URLs for every skill and resource |
| `/catalog.json`      | The complete public catalog (`schemaVersion: 1`), now including `resources`                                                                                                                                          |
| `/resources.v1.json` | Portable resource export: `format: "ecosystem-skills/resources"`, `version: 1`, each record with embedded `provenance`                                                                                               |

Canonical URLs: `/skills/<id>`, `/resources/<id>`, `/sources#<id>`. The files are deterministic (sorted, no
timestamps). They are informational and authorize nothing. Private skills, private authorization records, private
consumers and local paths are never part of them: the public registry rejects private records before anything is
generated, and the build fails on local paths or credential-like strings. Change the format by adding a new version
(`resources.v2.json`) rather than altering v1.

## Offline copies

The site is installable as an app and can open offline (see [website.md](website.md#installable-app-and-offline-use)).
An offline catalog is a saved copy: the site says so, and it is never authoritative for review, approval or
installation.
