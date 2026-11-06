# Deployment

How the app is built and shipped. Production runs the image CI builds ([ADR 0003](../adr/0003-ci-built-image-deployed-to-dokploy-with-rollback.md)) on a self-hosted Dokploy server; Docker Swarm rolls it out start-first and rolls it back on its own when it is unhealthy. Rolling back by hand: [rollback.md](rollback.md).

Every push to `main` runs `check → test → image → deploy`. A merge that only touches docs or Markdown doesn't run CI and isn't deployed.

## Container image

Built from the root `Dockerfile` by the CI job `image`, which runs after `check` and `test`.

- **Base:** `node:24-bookworm-slim` (glibc, so prebuilt native optional dependencies work). Runs as the unprivileged `node` user. `curl` is installed for the orchestrator's health check.
- **Contents:** the Next.js standalone server (`server.js` with its traced `node_modules` and static assets), `migrate.mjs` (the migration runner bundled by `pnpm build:migrate`) and the SQL migrations in `drizzle/`.
- **Start:** `node migrate.mjs && exec node server.js`. Migrations run before the server under a Postgres advisory lock, so two containers starting at once (start-first deploys) don't migrate concurrently. A failed migration stops the container before it serves.
- **Port:** 3000. Health: `GET /api/health` returns the database state and the running `commit`; `503` when the database is down.

### Registry and tags

Pushed to GHCR as `ghcr.io/<OWNER>/my-notebook` on pushes to `main` only; pull requests build and smoke-check the image without pushing.

| Tag            | Meaning                                         |
| -------------- | ----------------------------------------------- |
| `sha-<short>`  | The commit the image was built from (immutable) |
| `main`         | The latest build of `main` (moves)              |

Each push carries an SBOM and a max-mode provenance attestation. The OCI labels `org.opencontainers.image.source` (links the package to the repository) and `org.opencontainers.image.revision` (the commit) are set. The package must be public: production pulls without registry credentials.

### Build arguments

| Argument | Purpose                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------- |
| `COMMIT` | Full Git commit SHA. Baked into the image as the `COMMIT` env var and the revision label; reported by `/api/health`. CI passes `github.sha`. |

### Environment variables

Set on the running container. Names only; values live in the deployment platform.

| Name             | Required | Notes                                                       |
| ---------------- | -------- | ----------------------------------------------------------- |
| `DATABASE_URL`   | yes      | Postgres 18 connection URL                                  |
| `IP_HASH_SECRET` | yes      | 32+ characters; HMAC key for Visitor IPs                    |
| `LOG_LEVEL`      | no       | `info` by default                                           |
| `HOSTNAME`       | no       | Bind address; the image sets `0.0.0.0`                      |
| `PORT`           | no       | The image sets `3000`                                       |
| `NODE_ENV`       | no       | The image sets `production`                                 |
| `COMMIT`         | no       | Set by the build; don't override                            |
| `LLM_MODE`       | no       | `fake` (default: scripted answers, no key, no cost) or `real` |
| `ANTHROPIC_API_KEY` | with `real` | Required when `LLM_MODE=real`                          |
| `SOURCE_TOKEN_CAP` | no     | Tokens of enabled Sources per Notebook; `80000` by default  |

An invalid environment makes the server exit at start instead of serving errors.

### CI smoke check

The `image` job loads the built image, starts it against the job's Postgres service and polls `/api/health` until it answers `200` with `commit` equal to the build's commit. This also runs every migration against an empty database.

## Migrations: expand/contract

Deploys are start-first (the new container runs next to the old one) and a rollback never reverts the schema. Every migration must therefore work with the **previous** image still running:

1. **Expand:** add tables, or columns that are nullable or have a default. Ship code that writes both old and new shapes if needed.
2. **Contract:** drop or tighten the old columns in a **later** slice, once no running image reads them.

Never rename or drop a column, or add a `NOT NULL` column without a default, in the same release that stops using it.

## Deploy job

The CI job `deploy` runs on pushes to `main` only, after `check`, `test` and `image` (which pushed `sha-<short>` and `main`). It runs in the GitHub environment `production`, which only deploys from `main` and holds its secrets:

| Secret                   | Holds                                                         |
| ------------------------ | ------------------------------------------------------------- |
| `DOKPLOY_URL`            | Dokploy panel base URL, reachable only over the tailnet       |
| `DOKPLOY_API_KEY`        | Dokploy API key for CI                                        |
| `DOKPLOY_APPLICATION_ID` | The Application's id                                          |
| `PRODUCTION_URL`         | Public base URL of the app                                    |
| `TS_OAUTH_CLIENT_ID`     | Tailscale OAuth client (scope Auth Keys, tag `tag:ci`)        |
| `TS_OAUTH_SECRET`        | Its secret                                                    |

Steps:

1. **Check secrets and mask hosts.** Fails naming every secret that is unset. Masks the hosts of both URLs, so they don't show up in logs even when a tool prints them on their own.
2. **Join the tailnet** as an ephemeral node tagged `tag:ci` (`tailscale/github-action` with the OAuth client). The tailnet policy lets `tag:ci` reach only the Dokploy panel port; the node goes away after the job.
3. **Deploy:** `POST <DOKPLOY_URL>/api/application.deploy` with the `x-api-key` header and `{"applicationId": …}`. Dokploy queues the deployment, pulls `:main` and updates the Swarm service.
4. **Verify:** polls `<PRODUCTION_URL>/api/health` every 10 s for up to 5 minutes until `commit` equals the pushed commit. If Swarm rolls back, or the rollout hangs, production keeps reporting the old commit and the job fails.

CI runs on `main` queue rather than cancel each other, so a deploy is never cut off mid-rollout (pull request runs still cancel superseded ones). If several merges land while one deploys, GitHub keeps only the newest pending run, and `:main` already holds the newest image.

A failed deploy can be retried by re-running the failed jobs of that workflow run, as long as no newer merge has moved `:main` since.

## Dokploy setup

Done once by hand; record names and facts only, never hostnames or URLs.

- **Project** with a Dokploy-managed **Postgres 18** database (no backups configured; see the backup runbook) and an **Application**:
  - Source **Docker**, image `ghcr.io/<OWNER>/my-notebook:main`, no registry credentials (the package is public).
  - **Autodeploy off**: only CI deploys, so production only ever runs an image that passed CI.
  - One replica; a domain with HTTPS on container port `3000`.
  - Environment: `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000`, `LOG_LEVEL=info`, `LLM_MODE=fake`, `DATABASE_URL` (the database's internal URL), `IP_HASH_SECRET` (generated, 32+ characters).
- A dedicated **API key** for CI (`DOKPLOY_API_KEY`).
- The **Swarm settings** below in the Application's Swarm settings (Advanced tab).

### Swarm settings

Swarm gives a task with a health check the state *running* only once the check passes. With start-first, the old container keeps serving until then; if the new one never gets healthy, the update fails and Swarm rolls back to the previous image.

**Health Check** (durations in nanoseconds): `curl -f` against the app's own health route every 10 s, 5 s timeout, 3 retries, with 30 s of grace for migrations and boot. `/api/health` answers `503` when the database is down, so a container that can't reach Postgres never becomes healthy.

```json
{
  "Test": ["CMD", "curl", "-f", "http://localhost:3000/api/health"],
  "Interval": 10000000000,
  "Timeout": 5000000000,
  "StartPeriod": 30000000000,
  "Retries": 3
}
```

**Update Config**: one task at a time, start the new one before stopping the old one, roll back when the update fails.

```json
{
  "Parallelism": 1,
  "Order": "start-first",
  "FailureAction": "rollback"
}
```

Check what is applied with `docker service inspect <SERVICE> --format '{{json .Spec.TaskTemplate.ContainerSpec.Healthcheck}} {{json .Spec.UpdateConfig}}'` on the server.

## Switching `LLM_MODE`

Production runs `LLM_MODE=fake` (scripted answers, no Anthropic key, no LLM cost) until the spend caps are in place. To switch it:

1. In the Application's environment, set `ANTHROPIC_API_KEY` and change `LLM_MODE` to `real`. Without a key the new container refuses to start, its health check never passes and Swarm keeps the old one.
2. Click **Deploy** in Dokploy (or re-run the last `deploy` job). Environment changes only take effect with a new rollout.
3. Check `/api/health` still reports the same commit and try a Chat answer.

Switching back is the same with `LLM_MODE=fake`; the key can stay set.

## Raising caps for a recording

Caps are environment variables (today `SOURCE_TOKEN_CAP`; the spend caps of the budget guard follow the same pattern). To record a demo with higher limits:

1. Note the current values, then raise them in the Application's environment.
2. Deploy from Dokploy and wait until `/api/health` answers again.
3. Record.
4. Restore the noted values and deploy again. Don't leave raised caps on a public deployment.
