# Ownership, distribution and the FM Ecosystem section (ES25)

ES25 adds two facts to every skill, **ownership** and **distribution**, and an owner-only installation policy for FM Ecosystem
skills. It extends the ES24 private-skill model (see [private-skills.md](private-skills.md)) rather than replacing it: the same private
root, access records and curated-release engine are used.

Everything below is implemented unless it is marked _planned_.

## Trust boundaries and installation entry points (baseline review)

Before ES25 there were five ways a skill could become available to an agent in a project. All of them now ask one eligibility
decision (`packages/catalog/src/policy.ts`, `decide()`):

| Entry point                                                         | Code path                                            | Restricted skill                        |
| ------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------- |
| `skills:assign` (desired state in `registry/consumers.json`)        | `assignSkill` → `assignmentPolicy`                   | refused                                 |
| `skills:sync` / `skills:verify` (links to `skills/` or `external/`) | `planSync` → `resolveCanonical` → `assignmentPolicy` | blocked, never linked                   |
| `skills:install` (legacy upstream download into `external/skills`)  | `installSkill` → `installBlocker`                    | refused before any download             |
| `skills:library install / upgrade / rollback` (incl. `--migrate`)   | `planCurated` (preview) → `applyCurated` (apply)     | the only path; needs every check below  |
| Private access records with a desired `release`                     | `loadWorkspace` derives an assignment                | validated; never in the public registry |

Trust boundaries: the public repository and everything built from it are public; the private root is trusted only as far as it
belongs to the user running the tool and nobody else can write it; consumer repositories are never trusted to say what they may
use; nothing on the website is a control.

## 1. Ownership model

`ownership` on a skill: `fm-ecosystem` (built and maintained for FM Ecosystem projects by their owner), `first-party` (other skills
maintained here), `third-party` (maintained upstream by someone else). It is explicit metadata: a skill called `ecosystem-…` with no
field is not FM Ecosystem. Absent (every legacy record) is derived from `origin`: external → third-party, otherwise first-party.

Validation rejects ownership that the source contradicts: an external upstream cannot be `fm-ecosystem` or `first-party` (this
repository cannot verify who controls someone else's repository), and a first-party skill cannot be `third-party`.

Consumers may carry `ownership: "fm-ecosystem"` to declare a project the owner controls; absent means "not declared". Global
consumers cannot carry it. **Ownership grants nothing**: it is not an approval, an authorization or an identity.

## 2. Visibility model

Unchanged from ES24 (`public`, `private`, `local`) and independent of ownership and distribution. A public skill can be restricted;
a private skill is always restricted (or not distributable).

## 3. Distribution policies

```json
"distribution": { "policy": "restricted", "access": "owner-only", "note": "…" }
```

| Policy              | Meaning                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `open` (or absent)  | Installable under the existing approval and security rules. Every pre-ES25 skill stays here.          |
| `restricted`        | Only as an approved curated release, and only with an explicit private authorization. Needs `access`. |
| `not-distributable` | Discovery and documentation only; never assigned, authorized or installed.                            |

`access` (restricted only): `authorized-consumers` (an access record is enough; ES24 behaviour, the default for private skills) or
`owner-only` (additionally, the consumer must be declared owner-controlled). `owner-only` applies only to skills the owner
maintains. In the private root an unlabelled skill is `restricted` / `authorized-consumers`, and `open` is refused.

Restricted skills are never assigned in `registry/consumers.json` (validation error): their desired state is the access record's
`release`, in the private root, exactly as for ES24 private skills.

## 4. Owner-only authorization

A restricted skill may be installed for a consumer only when all of these hold:

1. **Distribution** is `restricted` (not `not-distributable`) and the path is the curated-release engine.
2. **Authorization source**: a private root is configured and passes its checks (below). Without one, every restricted install
   fails closed.
3. **Consumer authorization**: an access record names this consumer and this skill.
4. **Version**: the record lists this exact version (no wildcards; the schema rejects `*`).
5. **Agents**: the record lists every agent being linked.
6. **Owner-controlled consumer** (`owner-only` only): the public consumer record says `ownership: "fm-ecosystem"`.
7. **Release approval**: the release is approved and its security review recorded "no blocking issues" for its exact hash.
8. **Integrity**: library content and any store copy match their hashes; no symlinked or unsafe component anywhere.

Authorizing an unapproved version does not make it installable; approving a release does not authorize anyone; declaring a
consumer owner-controlled does not authorize it. Example record (in `<private root>/registry/access.json`):

```json
{
  "consumer": "gateway",
  "skill": "ecosystem-config",
  "agents": ["claude-code"],
  "releases": ["1.0.0"],
  "authorizedBy": "Owner",
  "authorizedAt": "2026-11-01"
}
```

There is no `--owner`, `--force` or similar option, no environment variable that stands in for a record, and `authorizedBy` is
descriptive text, not a credential.

## 5. CLI enforcement

- **One decision.** `decide()` covers distribution, authorization, consumer ownership and the release gate for every path in the
  table above. Callers only check integrity and format messages.
- **Preview and apply both decide.** `applyCurated` re-reads the access record, the public registry and the lock, and re-plans
  immediately before its first change. A grant revoked, a version removed, a consumer no longer owner-controlled, an approval
  withdrawn or a forged plan (blockers cleared, `restricted` flipped, another consumer substituted) is refused with nothing changed.
  The write-time checks stay as a second line (tested by simulating a race after the re-check).
- **Fail closed.** No private root, an unreadable record, an invalid record or an unsafe path all refuse.
- **Legacy rollback is an installation too** (audit remediation F1). `skills:rollback` and `rollbackSkill()` read the registry from disk
  immediately before the first change and restore a backup only when the current record allows a legacy install of exactly that revision
  and content hash (open distribution, approved, no blockers); otherwise nothing changes. `installSkill()` likewise decides from the
  registry on disk, not from the record passed in, and requires a readable, valid registry (no registry means no install). Both
  decide again immediately before the first change, after any download.
- **Legacy transactions** (second audit). Install, rollback and uninstall validate everything first (backup folder and metadata,
  destinations, the lock, every managed path), then make each change through one journal: every completed mutation (folder created,
  folder moved, file written, metadata removed) records its undo at once; files, including `external/installed.json`, are written to a
  temporary file and renamed into place, so a failure part-way through a write (for example `ENOSPC`) never changes the target. After a
  failure the journal is undone and the result is **checked** against a fingerprint taken before the change (lock bytes, live content
  hash, every backup and its metadata); only then does the message say "put back as it was (verified)", otherwise it says
  `ROLLBACK INCOMPLETE` and what differs. Tested by failing each single operation in turn, plus `EISDIR`, `ENOSPC` and partial writes.
  Not covered: a crash of the process or machine mid-change (no on-disk journal is replayed), and filesystems without atomic rename.
- **Managed paths are never followed through symlinks** (second audit): `external/`, `skills/`, `.backups/`, `.backups/<id>`,
  `.staging/`, backups, metadata and the lock must be reached through plain directories and are re-checked before each mutation.
- **Activation is recorded, not inferred** (F5): see private-skills.md §4 (`activeAgents`, revocation).
- **No private paths in output** (F3, second audit): paths this tool prints are formatted structurally (any path inside the private
  root, absolute or reached through a link, is shown as `<private root>/…`), so names with spaces or punctuation are handled; text it did
  not format (filesystem errors) has the root's absolute path, its relative path from the repository, the project and its agent folders,
  and any remaining `/<root folder name>` replaced. Raw read errors from the private root are reduced to the record name and error code.
  A parent folder of the root may still appear in a relative path the tool cannot anticipate; the root's own name does not.
- **Inventory follows what is installed, not only what is granted** (second audit): `skills:library status` also lists installs that
  are still tracked after their assignment or every grant was removed, with `authorization` (not-needed, authorized,
  partially-revoked, revoked), the desired version and active agents, and the links each agent folder actually has.
- **Store and lock** of a restricted public skill live in the private root (content still comes from the public `library/`), so
  `skills:sync --prune` never treats those links as its own and nothing about the install lands in the public repository.

## 6. Private authorization storage

The ES24 private root, with stronger checks: the root, `registry/` and every record file must be **owned by the user running the
tool** and **accessible by nobody else** (folders 0700, record files 0600, since the audit remediation; writes, including undo
writes, use those modes); record files must be regular files (no symlinks); access records are strictly
validated (unknown fields, wildcards, traversal and empty lists are refused). A private skill id may not collide with a public one,
so a private record cannot override a public skill's policy.

## 7. Security boundaries

The local check is the strongest identity this tool can establish without a hosted service: "the owner" is the operating-system
account that owns the private root. Anyone who can run as that account, including any agent session or script, can read and edit the
authorization records. The tool controls what **it** installs; it is not access control for the machine.

## 8. Limitations of public skill content

The instructions of `ecosystem-assets` and `ecosystem-config` are public in this repository and on the website. Anyone can read or
copy them, with or without this tool. "Restricted" governs managed installation through the CLI only; it never makes public text
inaccessible. For that reason public skills carry no secrets, credentials, private paths or private inventories. In ES25 the
`ecosystem-assets` skill was reduced to the approach only: the field-level catalog contract, private input files, intake folders and
script paths of the private repository were removed from the public copy (including its former `references/catalog-contract.md`),
and the skill now tells the agent to read that contract inside an authorized checkout.

## 9. FM Ecosystem website section

- `/ecosystem` ("FM Ecosystem" in the navigation, after Skills): what FM Ecosystem skills are, and a card per skill with ownership,
  visibility, distribution, integrations, related projects, installation policy, releases and review, agent compatibility and a
  link to the skill page. The list is the canonical catalog filtered by explicit `ownership`; there is no second registry.
- The skill library has **Owner** and **Distribution** filters, kept in the URL (`/skills?owner=fm-ecosystem&distribution=restricted`)
  and compatible with search, the other filters and Back/Forward.
- Every skill page has an "Ownership and distribution" section: maintainer, visibility, distribution, required authorization,
  review and approval, curated releases, installation status, supported agents and ecosystem projects. Restricted FM Ecosystem
  skills say: "This skill is developed for FM Ecosystem projects. Managed installation is restricted to authorized consumers."
- The site shows no install action and states that it enforces nothing. It never shows authorizations or restricted installs;
  their lifecycle rows say "Not published". The bundle contains none of the installer's policy code or messages.

## 10. Repository rename migration

Ecosystem Config's repository was renamed from `config-ecosystem` to `ecosystem-config`. Verified on 2026-10-30: the local checkout
is `../ecosystem-config` with remote `git@github.com:Fikrimarzuki/ecosystem-config.git`; GitHub reports
`Fikrimarzuki/ecosystem-config` as public with homepage `https://config.fikrimarzuki.work`; the old repository URL redirects to the
new one, and the old GitHub Pages URL no longer serves the site. The integration record (stable id `ecosystem-config`) now says:

```json
"homepage": "https://config.fikrimarzuki.work/",
"repository": { "name": "ecosystem-config", "formerNames": ["config-ecosystem"], "visibility": "public", "url": "https://github.com/Fikrimarzuki/ecosystem-config" }
```

Project mappings are unchanged; checkouts under either name resolve; it is the only record naming either name. Nothing in the
renamed repository was changed.

## 11. Installation and approval lifecycle (restricted first-party skill)

1. Stage the content as a release: `pnpm skills:library stage ecosystem-config 1.0.0 --from skills/shared/ecosystem-config`.
2. Add the release record (unapproved) to `registry/releases.json`, then review it (`pnpm skills:library review …`) and record the
   security review and the owner's approval by hand.
3. Declare the consumer owner-controlled (`"ownership": "fm-ecosystem"` in `registry/consumers.json`).
4. Write the access record in the private root.
5. Check: `pnpm skills:visibility ecosystem-config --consumer gateway --agents claude-code --version 1.0.0`.
6. Preview, then apply: `pnpm skills:library install gateway ecosystem-config --version 1.0.0 --agents claude-code [--apply]`.
7. Inspect: `pnpm skills:library status gateway` (lists restricted and private installs when a private root is configured).

None of these steps has been performed for a real consumer.

## 12. Future authentication options

_Planned, not implemented:_ signed access records (for example SSH or GPG signatures checked against an owner key kept outside the
private root); an OS keychain-held secret that unlocks the private root; a hosted identity provider issuing short-lived grants to a
CLI login. Each would make "the owner" stronger than "the account that owns the files", and none is needed for the current
single-owner, single-machine use.
