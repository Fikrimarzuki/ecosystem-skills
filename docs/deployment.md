# Deployment

The site is a fully static build (`apps/web/dist`). It is read-only: no server, API, database or
authentication. Routing uses URL hashes (`#/skills/...`), so no SPA rewrite rules are needed on any host.

## Build

```sh
pnpm install
pnpm build   # validates the registry, generates catalog.json, then builds the site
```

`pnpm build` runs `catalog:build` first. `apps/web/public/catalog.json` is generated and git-ignored,
so every deployment must run the root `pnpm build` (not only the web package's build).

## Base path

`BASE_PATH` sets the Vite `base` (default `/`). Leading/trailing slashes are normalized.

| Host                              | Command                                   |
| --------------------------------- | ----------------------------------------- |
| Vercel / root domain / custom dom | `pnpm build`                              |
| GitHub Pages project site         | `BASE_PATH=/ecosystem-skills/ pnpm build` |

## Vercel

`vercel.json` at the repo root configures install, build and output directory. Import the repository in
Vercel with the root directory left as the repo root. Requires pnpm (Vercel detects it from
`packageManager` in `package.json`).

## GitHub Pages

Not wired up yet (no workflow is committed, so nothing deploys on push). A workflow would:

1. Check out, set up pnpm and Node ≥ 20, `pnpm install --frozen-lockfile`.
2. Run `BASE_PATH=/<repo-name>/ pnpm build`.
3. Upload `apps/web/dist` with `actions/upload-pages-artifact` and deploy with `actions/deploy-pages`.

For a user/org site or a custom domain, omit `BASE_PATH`.
