# Consumer contract (summary)

A summary of Ecosystem Config's documented consumer contract (`docs/consumers/README.md` and `docs/consumers/integration.md` in that
repository). Those documents are authoritative.

## Output shape (version 1)

| Field | Notes |
| --- | --- |
| `version` | `1`; reject anything else |
| `username` | GitHub username used to build public repository links |
| `domains.primary` | Base for subdomain deployments |
| `profile`, `ecosystem` | Optional objects; members optional except `name` |
| `projects` | Object keyed by stable project id |
| `career`, `origins`, `concepts` | Always present; publication needs separate grants |
| `careerPublication`, `conceptsPublication` | Grant lists; absence denies publication |

## Project facts

| Field | Meaning | Does not imply |
| --- | --- | --- |
| `listing` (`public` / `hidden`) | Belongs in ecosystem listings | a public repository or a deployment; `hidden` is still public data |
| `status` (`active`, `paused`, `completed`, `archived`) | Lifecycle | visibility or deployments |
| `repositoryVisibility` (`public` / `private`) | The repository can be opened publicly | listing or deployment |
| `destination` | The one primary Gateway destination | anything else |
| `deployments` | Registered live deployments; `main` is a convention, not a guarantee | a public repository |
| `related` | Undirected project relationships, declared once | |
| `assets` | Approved public asset references (paths into Ecosystem Config) | |

## Deployment URL

```js
function deploymentUrl(config, deployment) {
  if (deployment.url !== undefined) return deployment.url; // external: use exactly as written
  const host =
    deployment.subdomain === null
      ? config.domains.primary
      : `${deployment.subdomain}.${config.domains.primary}`;
  return `https://${host}`;
}
```

## Sync rules

- At build time only; before dev, build, typecheck and test.
- Write to a temporary file and rename; on failure delete the previous output and fail the command.
- Validate the fields you use; ignore unknown fields.
- Fail loudly; never fall back to a stale committed snapshot.
