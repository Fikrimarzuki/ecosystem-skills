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

Requires Node ≥ 20 and pnpm (`corepack enable` picks up the pinned version).

```sh
pnpm install
pnpm dev        # generates the catalog, starts the site at http://localhost:5173
```

## Commands

| Command                                          | Purpose                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `pnpm dev`                                       | Run the Vite dev server (serves a freshly generated catalog)         |
| `pnpm build`                                     | Production build: validates the registry, emits `dist/catalog.json`  |
| `pnpm preview`                                   | Serve the production build                                           |
| `pnpm catalog:validate`                          | Validate `registry/*.json` only                                      |
| `pnpm catalog:build`                             | Validate and write `apps/web/public/catalog.json` (inspection only)  |
| `pnpm typecheck`                                 | TypeScript across workspaces                                         |
| `pnpm lint`                                      | ESLint                                                               |
| `pnpm format[:check]`                            | Prettier                                                             |
| `pnpm skills:<command> --help`                   | Usage, notes and examples for any skills command                     |
| `pnpm skills:links <dir> [id…]`                  | Read-only check of how skills are linked into a project              |
| `pnpm skills:review <id>`                        | Download an external skill at its pin and scan it                    |
| `pnpm skills:install <id>`                       | Install an **approved** external skill (local, ignored)              |
| `pnpm skills:status`                             | Local install state; `skills:rollback`, `:uninstall`                 |
| `pnpm --filter @ecosystem-skills/catalog eval …` | Natural-trigger evaluation harness (see docs/external-skills.md §11) |
| `pnpm skills:list` / `:assign` / `:unassign`     | Inspect and change consumer assignments (registry only)              |
| `pnpm skills:sync <consumer>` / `:verify`        | Reconcile and check a consumer's project-local links                 |
| `pnpm test`                                      | Vitest (validation, install, review, page rendering)                 |
| `pnpm check`                                     | Everything above, in order                                           |

## Layout

```
registry/            skills.json, consumers.json, integrations.json, evidence.json  (source of truth)
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
- [Agent compatibility](docs/agent-compatibility.md) (verified discovery conventions)
- [ES3 Momee migration record](docs/migrations/es3-momee-character-art.md)
- [Deployment](docs/deployment.md) (GitHub Pages with `BASE_PATH`, Vercel)

## Security stance

External skills are untrusted until the owner approves a specific revision; provenance (upstream vs fork,
pinned commit, licence, content hash) is recorded explicitly and checked again at install time. The site is read-only and never installs or executes anything. The catalog
generator rejects local paths and credential-like strings.
