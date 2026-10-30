# Curated library

`library/<skill-id>/<version>/` holds locally stored, versioned copies of skills. A folder here is **content only**: it is hashed, so nothing about its review or approval is stored inside it. Everything about a release (upstream, hashes, licence, modifications, security review, approval) lives in `registry/releases.json`.

- A folder here is **not** an approval and **not** installable by itself.
- Released folders are immutable. Change means a new version, never an edit.
- Do not edit these files by hand. Stage new content with `pnpm skills:library stage`, then add the registry record.
- `pnpm skills:library verify` (and `pnpm catalog:validate`) check every folder against its recorded hash and reject symlinks and untracked folders.

See [docs/library.md](../docs/library.md).
