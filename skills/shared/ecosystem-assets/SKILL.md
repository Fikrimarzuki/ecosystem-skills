---
name: ecosystem-assets
description: Find and reuse existing ecosystem assets (icons, illustrations, 3D models, animations, other media) before creating new ones. Use when a task needs an image, icon, logo, model or animation for an ecosystem project, or asks whether an asset already exists, what it may be used for, or which variant to ship.
---

# Ecosystem Assets

Ecosystem Assets is the private repository where the owner's creative source files and production exports live. Its catalog is the
documented, read-only way to find out what exists. Use this skill to look before you make something new, and to pick the right file
and variant when something suitable exists.

This skill only reads. Never edit, move, rename, regenerate or delete anything in Ecosystem Assets, and never copy files out of it
unless the user asks for that specific file and its publication rules allow it (see "Using an asset").

These public instructions describe the approach only. The catalog's files, fields and values are documented inside the private
repository; read them there. Do not restate that documentation, or anything from the catalog, outside the repository.

## 1. Locate the source

- The source is identified by the integration id `ecosystem-assets` in the Ecosystem Skills registry (`registry/integrations.json`),
  which records the current repository name and any former names. Look for a local checkout with one of those names next to the
  current project, or ask the user where it is. If there is none, say so and stop: do not guess paths or download anything.
- Having this skill does not give access to the repository. Without an authorized checkout there is nothing to read.
- The repository is private. Do not quote its contents into public repositories, issues or websites.

## 2. Read the catalog contract first

- Open the repository's catalog documentation (`docs/catalog.md`) and the schema it names. They define which generated files make up
  the catalog, which of them are private, and what every field means. They are authoritative.
- Read the generated catalog, not the folders. If it is missing or stale, ask the user to regenerate it as that documentation
  describes; do not run repository scripts yourself unless the user asks.
- Never infer an asset's purpose, rights or approval from its filename or folder.

## 3. Search before creating

1. Identify the project. Ecosystem projects share one id with Ecosystem Config (for example `gateway`); the catalog uses it. A label
   that is not a confirmed project id is not one.
2. Search the catalog by project, category, format, tags, titles and the groups the catalog defines.
3. Prefer production exports over editable masters; drafts, review copies, references and legacy files are not for shipping.
4. Check the rights status. Only verified rights can be relied on; anything else means: do not ship it, and tell the user.
5. Check publication. Assets are private unless the catalog records an explicit approval for public delivery of that exact file.
6. Report what you found (ids, roles, rights, publication) and let the user choose. If nothing fits, say so before creating a new
   asset, and follow the repository's asset guidelines (`docs/asset-guidelines.md`) if the user asks you to create one there.

## 4. Choosing a variant

- Use the export size or format the target needs (for example a PNG at the needed size, a PWA icon set, a web-ready model) rather
  than resizing a source yourself.
- Identical copies in different export folders can be intentional; pick by intended use, not by path.
- Follow the project's own asset requirements (sizes, formats, licences, naming) where they exist.

## 5. Using an asset

- Applications own their runtime assets: the user copies an approved export into the application and serves it from there. An
  application never links into Ecosystem Assets.
- Approved public references for project icons and logos live in Ecosystem Config (`assets.icon`, `assets.logo`, ...); prefer those
  when a project already has one.
- Keep attribution and licence notes with any copy, as the catalog or the notes beside the asset say.
- Never copy an editable master, a private record or anything with unresolved rights into a public repository or website.
- Large binaries may be stored as Git LFS pointers; if a file is a pointer, say so instead of fetching it.
