---
name: ecosystem-config
description: Use the ecosystem's shared configuration (projects, repositories, deployments, domains, profile, approved asset references) and its conventions instead of hardcoding them, and follow each project's own tooling setup. Use when a task needs a project's URL, domain, repository, deployment or metadata, adds a build-time sync of the shared configuration, or asks how an ecosystem project should be configured (TypeScript, ESLint, Prettier, framework, package manager, CI, tests).
---

# Ecosystem Config

Ecosystem Config is the single source of truth for shared public facts about the owner's projects: project records, repositories,
deployments, domains, profile, ecosystem identity and approved public asset references. Applications read it at build time.

This skill recommends and explains. It never edits Ecosystem Config, never installs dependencies and never rewrites a project's
configuration on its own: propose a change, show an example, and let the user decide.

## 1. Locate the source

- The source is identified by the integration id `ecosystem-config` in the Ecosystem Skills registry (`registry/integrations.json`).
  That record holds the repository's current name (`ecosystem-config`) and its former names (`config-ecosystem`); a local checkout
  under either name is the same source. Refer to it by the id, not by a folder name.
- If no checkout is available, the published files are public (see the repository's `docs/consumers/integration.md`). Do not guess.

## 2. Read the generated output only

- `dist/ecosystem.json` is the canonical file for new consumers; `config/production.json` is the byte-identical compatibility copy.
- Do not read `config/global.json`, `config/projects/*.json` or `.github/consumers.json` from an application: they are build inputs
  or automation metadata.
- `version` must be `1`; reject anything else. Validate only the fields you use and ignore unknown fields (the schema grows).
- `projects` is keyed by stable project id (for example `playnest`, `fmStudios`). Never rename ids locally.

See [references/consumer-contract.md](references/consumer-contract.md) for resolution rules.

## 3. Don't hardcode shared facts

Instead of writing a domain, project URL, repository link or project name into code:

1. Sync the configuration at build time (before dev, build, typecheck and test), write it to a generated file atomically, and delete
   the output if the sync fails, so a stale copy never ships. Never fetch it from visitors' browsers.
2. Resolve deployment URLs with the documented rules (`url` as written; otherwise `subdomain` under `domains.primary`; `subdomain: null`
   is the apex).
3. Link a repository only when `repositoryVisibility` is `"public"`.
4. Treat `listing`, `status` and `repositoryVisibility` as independent. `listing: "hidden"` is not confidential: everything in this
   configuration is public.
5. Career and Concepts content needs explicit publication grants; listing never grants permission.

## 4. Tooling conventions

Ecosystem Config does **not** publish shared TypeScript, ESLint, Prettier, framework, test or CI configuration packages. Do not
invent ecosystem-wide rules. For these, use the profile ids in [references/profiles.md](references/profiles.md):

- Follow the project's own existing configuration files and scripts first (`package.json`, `tsconfig*.json`, ESLint and Prettier
  configs, CI workflows). Match them; do not replace them.
- Use the package manager and Node version the project declares (`packageManager`, `engines`, `.nvmrc`). Do not switch package managers
  or add dependencies without the user's approval.
- If a project consumes Ecosystem Config, its sync script runs before dev, build, typecheck and test; keep it that way.
- When a convention is not documented anywhere, say so and ask, rather than presenting a guess as a standard.

## 5. Changing the configuration itself

Changes to Ecosystem Config are made in that repository by its owner: edit the source files, run its build, validation and tests,
and commit the sources with both regenerated outputs. Generated files are never edited by hand. From another project, describe the
change the user should make there; do not make it.
