# Ecosystem Skills

Central registry for reusable AI-agent capabilities (Claude Code, Codex, Cursor later) across personal
projects: skills (first-party and external), consumers, and the MCP/CLI integrations they depend on.
A static, read-only website in `apps/web` browses the generated catalog.

> Status: 2 first-party skills (Momee's is live in ecosystem-assets) and 25 reviewed external candidates, of which
> 4 are approved and pilot-verified with Claude Code and Codex. 2 (`grilling`, `verification-before-completion`) are linked into this repo only.
> Project-local discovery is verified for Claude Code and Codex on macOS; global discovery is not.

## Setup

Requires Node ≥ 20 and pnpm (`corepack enable` picks up the pinned version).

```sh
pnpm install
pnpm dev        # generates the catalog, starts the site at http://localhost:5173
```

## Commands

| Command                                          | Purpose                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `pnpm dev`                                       | Build catalog, run the Vite dev server                               |
| `pnpm build`                                     | Validate registry, build catalog, production site build              |
| `pnpm preview`                                   | Serve the production build                                           |
| `pnpm catalog:validate`                          | Validate `registry/*.json` only                                      |
| `pnpm catalog:build`                             | Validate and write `apps/web/public/catalog.json`                    |
| `pnpm typecheck`                                 | TypeScript across workspaces                                         |
| `pnpm lint`                                      | ESLint                                                               |
| `pnpm format[:check]`                            | Prettier                                                             |
| `pnpm skills:links <dir> [id…]`                  | Read-only check of how skills are linked into a project              |
| `pnpm skills:review <id>`                        | Download an external skill at its pin and scan it                    |
| `pnpm skills:install <id>`                       | Install an **approved** external skill (local, ignored)              |
| `pnpm skills:status`                             | Local install state; `skills:rollback`, `:uninstall`                 |
| `pnpm --filter @ecosystem-skills/catalog eval …` | Natural-trigger evaluation harness (see docs/external-skills.md §11) |
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

- [Registry reference](docs/registry.md)
- [External skills](docs/external-skills.md) (discovery, review, install, update, rollback, licensing)
- [Agent compatibility](docs/agent-compatibility.md) (verified discovery conventions)
- [ES3 Momee migration record](docs/migrations/es3-momee-character-art.md)
- [Deployment](docs/deployment.md) (GitHub Pages with `BASE_PATH`, Vercel)

## Security stance

External skills are untrusted until the owner approves a specific revision; provenance (upstream vs fork,
pinned commit, licence, content hash) is recorded explicitly and checked again at install time. The site is read-only and never installs or executes anything. The catalog
generator rejects local paths and credential-like strings.
