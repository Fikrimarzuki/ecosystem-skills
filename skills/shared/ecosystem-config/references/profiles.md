# Configuration profiles

Stable ids for configuration topics, so projects and skills can refer to a topic without naming a repository or a path. Each profile
says where its convention comes from today. "No shared source" means the ecosystem has no published standard for it yet: follow the
project's own setup and ask before changing it.

| Profile id | Topic | Source today |
| --- | --- | --- |
| `ecosystem-sync` | Build-time sync of the shared configuration | Ecosystem Config: `docs/consumers/integration.md` (documented) |
| `project-facts` | Project ids, repositories, deployments, domains, destinations | Ecosystem Config: `dist/ecosystem.json` (documented) |
| `asset-references` | Approved public icon/logo/thumbnail references | Ecosystem Config: `docs/assets.md` (documented) |
| `config-ci` | CI for the configuration repository itself (build, validate, test; generated files up to date) | Ecosystem Config: `docs/development.md` (documented) |
| `package-management` | Package manager and Node version | No shared source: each project's `packageManager` / `engines` |
| `typescript` | TypeScript compiler settings | No shared source: each project's `tsconfig*.json` |
| `eslint` | Lint rules | No shared source: each project's ESLint config |
| `prettier` | Formatting | No shared source: each project's Prettier config |
| `framework` | Vite, React, Next.js, Expo and similar settings | No shared source: each project's framework config |
| `testing` | Test runner and conventions | No shared source: each project's test setup |
| `ci` | CI workflows of application repositories | No shared source: each project's workflows |

When a shared source is added for a profile, update this table (and the Ecosystem Skills integration record); skills and projects
keep using the same profile id.
