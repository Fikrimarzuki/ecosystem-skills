# external/

Managed local directory for third-party skills. Everything here except this README is git-ignored.

| Path                  | Contents                                                                 |
| --------------------- | ------------------------------------------------------------------------ |
| `skills/<id>/`        | Installed copies of **approved** external skills, at the pinned revision |
| `installed.json`      | Local install lock: revision + content hash per installed skill          |
| `.backups/<id>/`      | Previous installs kept for rollback (never deleted automatically)        |
| `.review/<id>@<sha>/` | Downloads made by `pnpm skills:review` for human inspection              |
| `.staging/`           | Temporary extraction area; cleaned up after every operation              |

Installing never activates a skill for a consumer. See `docs/external-skills.md`.
