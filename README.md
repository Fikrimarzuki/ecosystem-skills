# Ecosystem Skills

Central registry for reusable AI-agent capabilities (Claude Code, Codex, Cursor later) across personal
projects: skills (first-party and external), consumers, and the MCP/CLI integrations they depend on.
A static, read-only website in `apps/web` browses the generated catalog.

> Status: 2 first-party skills and 27 reviewed external candidates. 6 are approved; 4 of those are installed locally
> (`caveman` and `ponytail` are approved but not installed or assigned).
> Active consumers: `ecosystem-skills` (smoke test, `grilling`, `verification-before-completion`), `ecosystem-assets`
> (Momee character art) and `playnest` (`verification-before-completion`). Discovery and explicit invocation are
> verified for Claude Code and Codex on macOS; natural triggering is partial and behavioral effect is not established.

## Setup

Requires Node ≥ 20 and **pnpm 12.11.2**, the version pinned in `package.json` (`packageManager`). Check with `pnpm --version` in this
folder: pnpm 11 and later switch to the pinned version on their own when they can download it or find it cached; `corepack enable` is
the other route (not tried on the development machine). `pnpm check` starts by refusing to run under any other version, so its results
are always a reproduction of this repository's checks; run it as `pnpm check` from the repository root.

```sh
pnpm install
pnpm dev        # generates the catalog, starts the site at http://localhost:5173
```

## Commands

| Command                                             | Purpose                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                          | Run the Vite dev server (serves a freshly generated catalog)                                                                                                  |
| `pnpm build`                                        | Production build: validates the registry, emits `dist/catalog.json`                                                                                           |
| `pnpm preview`                                      | Serve the production build                                                                                                                                    |
| `pnpm catalog:validate`                             | Validate `registry/*.json` only                                                                                                                               |
| `pnpm catalog:build`                                | Validate and write `apps/web/public/catalog.json` (inspection only)                                                                                           |
| `pnpm typecheck`                                    | TypeScript across workspaces                                                                                                                                  |
| `pnpm lint`                                         | ESLint                                                                                                                                                        |
| `pnpm format[:check]`                               | Prettier                                                                                                                                                      |
| `pnpm skills:<command> --help`                      | Usage, notes and examples for any skills command                                                                                                              |
| `pnpm skills:links <dir> [id…]`                     | Read-only check of how skills are linked into a project                                                                                                       |
| `pnpm skills:review <id>`                           | Download an external skill at its pin and scan it                                                                                                             |
| `pnpm skills:install <id>`                          | Install an **approved** external skill (local, ignored)                                                                                                       |
| `pnpm skills:status`                                | Local install state; `skills:rollback`, `:uninstall`                                                                                                          |
| `pnpm --filter @ecosystem-skills/catalog eval …`    | Natural-trigger evaluation harness (see docs/external-skills.md §11)                                                                                          |
| `pnpm skills:list` / `:assign` / `:unassign`        | Inspect and change consumer assignments (registry only)                                                                                                       |
| `pnpm skills:sync <consumer>` / `:verify`           | Reconcile and check a consumer's project-local links                                                                                                          |
| `pnpm skills:library <command>`                     | Curated library: list, verify, review, install, upgrade, rollback, status, check-upstream, prepare (previews unless `--apply`/`--write`; see docs/library.md) |
| `pnpm --filter @ecosystem-skills/catalog eval:es19` | Comparative evaluation planner (no agent is run)                                                                                                              |
| `pnpm test`                                         | Vitest (validation, install, review, page rendering)                                                                                                          |
| `pnpm check`                                        | Everything above, in order                                                                                                                                    |

## Layout

```
registry/            skills.json, sources.json, releases.json, evaluations.json, updates.json, consumers.json, integrations.json, evidence.json  (source of truth)
library/             curated, versioned local copies (content only; see docs/library.md)
skills/              first-party skill content (shared/, projects/<project>/)
external/            git-ignored installs, backups and review downloads of external skills
packages/catalog/    schema, validation, catalog generator, review scanner, installer + tests
apps/web/            Vite + React + Tailwind static site
docs/                registry reference, deployment
```

`adapters/` will be added when it contains real content.

## Docs

- [Website](docs/website.md) (landing page, pages, English/Bahasa Indonesia, status vocabulary, accessibility)
- [Consumer management CLI](docs/consumers.md) (assign, sync, verify; approval vs installation vs activation)
- [Onboarding: find a skill and get it working](docs/consumers.md#onboarding-from-discovery-to-verified-use) (who approves what)
- [Registry reference](docs/registry.md)
- [External skills](docs/external-skills.md) (discovery, review, install, update, rollback, licensing)
- [Curated library](docs/library.md) (hybrid architecture, security review workflow, curated install/upgrade/rollback, evaluations, upstream checks, release preparation, legacy migration)
- [ES16 discovery report](docs/es16-discovery.md) (29 requested sources, 216 registered candidates, audit findings)
- [ES22 security audit](docs/es22-audit.md) (trust boundaries, fixes, staged candidates, legacy recovery plan, owner decisions)
- [ES23 adoption pilot](docs/es23-pilot.md) (archive hardening, accessibility 1.0.1, isolated evaluation environment, approval decision sheet)
- [Private skills and ecosystem integrations](docs/private-skills.md) (ES24: visibility, private storage, access, Ecosystem Assets and Config, project mappings)
- [Ownership, distribution and FM Ecosystem](docs/es25-ownership-distribution.md) (ES25: ownership, open/restricted/not-distributable, owner-only installs, the `/ecosystem` page, the Ecosystem Config rename)
- [Agent compatibility](docs/agent-compatibility.md) (verified discovery conventions)
- [ES3 Momee migration record](docs/migrations/es3-momee-character-art.md)
- [Deployment](docs/deployment.md) (GitHub Pages with `BASE_PATH`, Vercel)

## Security stance

External skills are untrusted until the owner approves a specific revision; provenance (upstream vs fork,
pinned commit, licence, content hash) is recorded explicitly and checked again at install time. The site is read-only and never installs or executes anything. The catalog
generator rejects local paths and credential-like strings.
