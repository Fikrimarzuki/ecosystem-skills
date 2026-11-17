# Deployment

The site is a fully static build (`apps/web/dist`). It is read-only: no server, API, database or
authentication. It uses clean browser-history URLs (`/skills/caveman`), so **the host must serve `index.html` for
application routes**: see [Clean URLs and the SPA fallback](#clean-urls-and-the-spa-fallback).

## Build

```sh
pnpm install
pnpm build   # from the repo root, or `pnpm run build` from apps/web: both give the same dist/
```

The build output (`apps/web/dist`) contains `index.html`, the hashed `assets/` and **`catalog.json`**, the data the
site loads at runtime (`GET <base>catalog.json`).

### How the catalog gets into the build

`catalog.json` is generated from `registry/*.json` **by the Vite build itself**. A small plugin
(`apps/web/catalog-plugin.ts`, registered in `vite.config.ts`) loads and validates the registry with the same code as
`pnpm catalog:validate` and emits `catalog.json` straight into `dist/`. Consequences:

- Any command that runs `vite build` produces it: `pnpm build` at the root, `pnpm run build` in `apps/web`, or a
  host's framework default. No host setting and no manual step such as `pnpm catalog:build` is needed.
- An invalid or missing registry **fails the build** with the validation errors (`Catalog generation failed: …`), so
  a site without a catalog is never published.
- The file is not a source asset, so a stale `apps/web/public/catalog.json` from a local `pnpm catalog:build` cannot
  override it: the freshly generated one wins.
- `pnpm dev` serves a freshly generated `/catalog.json` from the same code.

**Why the catalog is not committed.** It is derived data: the registry is the single source of truth, and a committed
copy could drift from it or publish stale review and evidence text. `apps/web/public/catalog.json` (written only by the
optional `pnpm catalog:build`, for inspection) and `dist/` are git-ignored, and a test asserts both stay untracked.

This was the cause of a production `HTTP 404` on `/catalog.json`: the site had been built from `apps/web`, whose build
script did not generate the catalog (only the repo-root script did), and the file is git-ignored, so a fresh clone
never contained it.

## Clean URLs and the SPA fallback

Pages live at `/`, `/overview`, `/skills`, `/skills/<id>`, `/consumers` and `/integrations`. They are not separate
files: the browser loads `index.html` and the app reads the address. So opening or refreshing `/skills/caveman`
only works if the host answers that path with `index.html`.

On Vercel this is one rewrite in `apps/web/vercel.json`:

```json
"rewrites": [{ "source": "/((?!assets/)[^.]*)", "destination": "/index.html" }]
```

- Vercel serves real files first and applies a rewrite only when no file matches, so `/catalog.json` and the hashed
  files in `/assets/` are always served as themselves.
- The pattern also never matches `/assets/…` or any path containing a dot, so a **missing** asset or file is a real
  404, not an HTML page that a browser would try to run as JavaScript.
- Routes the app does not know (`/nope`) still receive `index.html` (status 200) and the app shows its own "Page not
  found" page. That is a "soft 404"; it is the usual trade-off for a client-routed site.
- `index.html` references `/assets/…` with absolute paths, so deep links such as `/skills/caveman` load their
  JavaScript and CSS correctly.

**Other hosts need the equivalent rule** (Netlify `/* /index.html 200`, nginx `try_files $uri /index.html`, and so
on). **GitHub Pages cannot rewrite**: navigating inside the app works, but opening or refreshing a deep link returns
GitHub's 404 unless a copy of `index.html` is also published as `404.html`. Nothing here does that yet; use Vercel
or add that step if Pages is ever wired up.

**Old hash links keep working.** Bookmarks such as `/#/skills/caveman` or `/#/skills?status=approved` are rewritten
to the clean URL in the browser on load (`history.replaceState`: no reload, no extra Back entry). Details are in
[website.md](website.md#urls-and-routing).

## Base path

`BASE_PATH` sets the Vite `base` (default `/`). Leading/trailing slashes are normalized.

| Host                                 | Command                                   |
| ------------------------------------ | ----------------------------------------- |
| Vercel / root domain / custom domain | `pnpm build`                              |
| GitHub Pages project site            | `BASE_PATH=/ecosystem-skills/ pnpm build` |

## Vercel

Settings that match the working project (and that `apps/web/vercel.json` also states):

| Setting                                  | Value                                                   |
| ---------------------------------------- | ------------------------------------------------------- |
| Framework Preset                         | Vite                                                    |
| Root Directory                           | `apps/web`                                              |
| Include files outside the Root Directory | Enabled (the build reads `registry/` and `packages/`)   |
| Node.js version                          | 24.x                                                    |
| Install Command                          | `pnpm install --frozen-lockfile` (Automatic also works) |
| Build Command                            | `pnpm run build` (Automatic also works)                 |
| Output Directory                         | `dist`                                                  |
| Environment variables                    | none (`BASE_PATH` only for a sub-path host)             |

`vercel.json` lives in `apps/web/`, the Root Directory, because Vercel reads it from the project's root directory and
all paths in it are relative to that folder (hence `dist`, not `apps/web/dist`). There is deliberately no second
`vercel.json` at the repository root; a test enforces that. If the Root Directory is ever changed back to the
repository root, move the file there and use `outputDirectory: "apps/web/dist"` and `pnpm build`.
Requires pnpm (detected from `packageManager` in `package.json`).

**Verify a deployment.** Open `https://<your-domain>/catalog.json`: it must return `200` and JSON beginning
`{"schemaVersion": 1, "skills": [...]`; the site's skill count equals the registry's. Or from a terminal:

```sh
curl -s https://<your-domain>/catalog.json | python3 -c "import json,sys; c=json.load(sys.stdin); print({k: len(v) for k, v in c.items() if isinstance(v, list)})"
```

If the page shows "Could not load the catalog (HTTP 404)", the deployed build did not contain `catalog.json`: check
that the project builds from the commit that includes `apps/web/catalog-plugin.ts`, and read the build log for
`dist/catalog.json`.

## GitHub Pages

Not wired up yet (no workflow is committed, so nothing deploys on push). A workflow would:

1. Check out, set up pnpm and Node ≥ 20, `pnpm install --frozen-lockfile`.
2. Run `BASE_PATH=/<repo-name>/ pnpm build`.
3. Upload `apps/web/dist` with `actions/upload-pages-artifact` and deploy with `actions/deploy-pages`.

For a user/org site or a custom domain, omit `BASE_PATH`. Remember the deep-link limitation above: Pages needs a
`404.html` copy of `index.html` for refreshes of deep links to work.

## Readiness check (ES8.5, 2026-10-27)

_Historical: this check was made when the site used hash routes. Clean URLs have different hosting needs; see
[Clean URLs and the SPA fallback](#clean-urls-and-the-spa-fallback)._

Verified from a copy containing only git-tracked, non-ignored files (no `node_modules`, no `external/` installs):

| Check                                                              | Result                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                   | exit 0 (after the `allowBuilds` fix below)                                     |
| `pnpm check` (typecheck, lint, format, registry, all tests, build) | passes                                                                         |
| Build output                                                       | `index.html`, hashed `assets/`, `catalog.json`; no local paths, tokens or logs |
| `BASE_PATH=/ecosystem-skills/` build, served under that path       | page loads, 0 failed requests, deep-link reload works (then, with hash routes) |
| Environment variables                                              | only the optional `BASE_PATH`; no secrets, no runtime config                   |
| Backend, database, authentication                                  | none                                                                           |

**Fix found during this check.** pnpm 12 makes `pnpm install` exit 1 when a dependency has an unreviewed build
script (here `esbuild`). That is the install command Vercel runs (`apps/web/vercel.json`), so a Vercel deploy would have failed at install.
`pnpm-workspace.yaml` now records `allowBuilds: { esbuild: false }`: install scripts are not run, and the build works
because esbuild ships prebuilt binaries.

**Data boundary.** `catalog.json` is generated from `registry/*.json` only. The registry schema is strict, the
generator rejects local paths and credential-like strings, and the web tests assert that the real catalog and every
rendered page contain none. Installation state (`external/installed.json`) is never read.

**Fresh clones.** `.claude/skills/*` and `.agents/skills/*` entries for external skills point into the git-ignored
`external/skills/`, so on a fresh clone those links dangle. Agents ignore dangling links, and the site is unaffected.

## Recommendation

**Use Vercel first.** `apps/web/vercel.json` states install, build and output directory, and the catalog is generated
by the build itself; there is no base path to manage and no workflow file to write or maintain. Import the
repository with the Root Directory set to `apps/web` and no environment variables. GitHub Pages works too (verified above with `BASE_PATH`) but needs a workflow file, a
`BASE_PATH` that matches the repository name, and Pages enabled for the repository; choose it if you want everything
on GitHub. Neither is configured to deploy automatically, and no custom domain is set.

If the repository is public, anything in the registry becomes public too, including review findings and evidence
text. Read `registry/*.json` once with that in mind before publishing.
