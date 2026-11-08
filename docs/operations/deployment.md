# Deployment

How the app is built and shipped. Production runs the image CI builds ([ADR 0003](../adr/0003-ci-built-image-deployed-to-dokploy-with-rollback.md)) on a self-hosted Dokploy server; Docker Swarm rolls it out start-first and rolls it back on its own when it is unhealthy. Rolling back by hand: [rollback.md](rollback.md).

Every push to `main` runs `check → test → image → security → publish → deploy`. A merge that only touches docs or Markdown doesn't run CI and isn't deployed.

## Container image

Built from the root `Dockerfile` by the CI job `image`, which runs after `check` and `test`. The `security` job scans that image, and only then does `publish` push it (see [CI pipeline](#ci-pipeline)).

- **Base:** the build stages use `node:24-bookworm-slim`; the runtime is `debian:bookworm-slim` (same release and glibc, so prebuilt native optional dependencies and the Agent SDK's Claude Code binary work) with only the `node` binary copied in: no npm, yarn, corepack or C headers. Runs as the unprivileged `node` user (uid 1000). `curl` is installed for the orchestrator's health check.
- **Size:** the `image` job writes the image size and its layers to the job summary on every run. The largest single part is the Agent SDK's bundled Claude Code binary (~340 MB), which Agent mode needs. sharp is excluded (`images.unoptimized`, no `next/image` in the app).
- **Contents:** the Next.js standalone server (`server.js` with its traced `node_modules` and static assets), `migrate.mjs` (the migration runner bundled by `pnpm build:migrate`) and the SQL migrations in `drizzle/`.
- **Start:** `node migrate.mjs && exec node server.js`. Migrations run before the server under a Postgres advisory lock, so two containers starting at once (start-first deploys) don't migrate concurrently. A failed migration stops the container before it serves.
- **Port:** 3000. Health: `GET /api/health` returns the database state and the running `commit`; `503` when the database is down.

### Registry and tags

Pushed to GHCR as `ghcr.io/<OWNER>/my-notebook` by the `publish` job, on pushes to `main` only; pull requests build, smoke-check and scan the image without pushing.

| Tag           | Meaning                                                 |
| ------------- | ------------------------------------------------------- |
| `sha-<short>` | The commit the image was built from (never overwritten) |
| `main`        | The latest build of `main` (moves)                      |

Each push carries an SBOM and a max-mode provenance attestation. The OCI labels `org.opencontainers.image.source` (links the package to the repository) and `org.opencontainers.image.revision` (the commit) are set. The package must be public: production pulls without registry credentials.

### Build arguments

| Argument | Purpose                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMMIT` | Full Git commit SHA. Baked into the image as the `COMMIT` env var and the revision label; reported by `/api/health`. CI passes `github.sha`. |

### Environment variables

Set on the running container. Names only; values live in the deployment platform.

| Name                | Required    | Notes                                                         |
| ------------------- | ----------- | ------------------------------------------------------------- |
| `DATABASE_URL`      | yes         | Postgres 18 connection URL                                    |
| `IP_HASH_SECRET`    | yes         | 32+ characters; HMAC key for Visitor IPs                      |
| `LOG_LEVEL`         | no          | `info` by default                                             |
| `HOSTNAME`          | no          | Bind address; the image sets `0.0.0.0`                        |
| `PORT`              | no          | The image sets `3000`                                         |
| `NODE_ENV`          | no          | The image sets `production`                                   |
| `COMMIT`            | no          | Set by the build; don't override                              |
| `LLM_MODE`          | no          | `fake` (default: scripted answers, no key, no cost) or `real` |
| `ANTHROPIC_API_KEY` | with `real` | Required when `LLM_MODE=real`                                 |
| `SOURCE_TOKEN_CAP`  | no          | Tokens of enabled Sources per Notebook; `80000` by default    |
| `DEMO_BUDGET_DAILY_USD` | no | Demo budget per day (resets at midnight Europe/Berlin); `2` |
| `DEMO_BUDGET_TOTAL_USD` | no | Demo budget in total, all production spend; `13` |
| `DAILY_ALLOWANCE_USD` | no | Daily allowance per Visitor; `0.5` |
| `CHAT_RATE_LIMIT_PER_HOUR` | no | Chat questions per Visitor per hour; `30` |
| `AGENT_RATE_LIMIT_PER_HOUR` | no | Agent runs per Visitor per hour; `3` |
| `BRIEFING_RATE_LIMIT_PER_HOUR` | no | Briefings per Visitor per hour; `3` |
| `AGENT_CONCURRENCY_LIMIT` | no | Agent runs at the same time, demo-wide; `2` |
| `NEW_VISITORS_PER_IP_PER_DAY` | no | New Visitors per IP (hashed) per day; `5` |
| `AGENT_MAX_TURNS` | no | Model turns per Agent run; `15` |
| `AGENT_MAX_BUDGET_USD` | no | Spend per Agent run, in USD; `0.3` |
| `AGENT_TIMEOUT_SECONDS` | no | Wall-clock time per Agent run; `180` |
| `AGENT_MAX_NOTES` | no | Notes one Agent run may write; `2` |
| `AGENT_MAX_WEB_SEARCHES` | no | Web searches per Agent run ($0.01 each); `3` |
| `AGENT_MAX_PAGE_READS` | no | Web pages one Agent run may read; `5` |
| `AGENT_MAX_SOURCES_ADDED` | no | Web pages one Agent run may add as Sources; `2` |
| `CLAUDE_CODE_OAUTH_TOKEN` | **never** | The server refuses to start in production when it is set |

Never set `URL_FETCH_TEST_LOOPBACK_PORT` on a deployment: it lets the guarded URL fetcher reach one loopback port and exists only for the integration and e2e fixtures (the server refuses it with `LLM_MODE=real`).

An invalid environment makes the server exit at start instead of serving errors.

### CI smoke check

The `image` job loads the built image, starts it against the job's Postgres service and polls `/api/health` until it answers `200` with `commit` equal to the build's commit. This also runs every migration against an empty database.

It then runs `docker/check-agent-binary.mjs` in the image, which resolves the Agent SDK's bundled Claude Code binary the way the SDK does and starts it with `--version`. File tracing can't see that binary (an optional, per-platform package resolved at runtime), so `next.config.ts` copies it into the standalone output with `outputFileTracingIncludes`; the check catches the day it goes missing.

## CI pipeline

`ci.yml` runs `check → test → image → security` on every pull request and push to `main`, then `publish` and `deploy` on pushes to `main` only; `pr-title.yml` checks the pull request title.

| Job        | What it does                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `check`    | Typecheck, lint, format check                                                                                  |
| `test`     | Unit, integration and e2e tests (fake `llm`)                                                                   |
| `image`    | Builds the image, smoke-checks it and hands it to `security` as an artifact                                    |
| `security` | gitleaks over the full Git history; Trivy scan of that image, failing on CRITICAL vulnerabilities with a fix   |
| `publish`  | `main` only: rebuilds the image with SBOM and provenance, pushes it by digest, scans that digest, then tags it |
| `deploy`   | `main` only: deploys the published image on Dokploy (see [Deploy job](#deploy-job))                            |
| `pr-title` | The PR title is a Conventional Commits subject (it becomes the squash commit on `main`)                        |

Trivy scans only the image, not the repository: the image holds the OS packages and the production dependencies that actually ship. Unfixable findings don't fail the build because there is nothing to upgrade to; Dependabot picks up the fix once it exists.

### Branch protection

Mark these checks as required on `main`: `check`, `test`, `image`, `security`, `pr-title`. `publish` and `deploy` are skipped on pull requests, so they are not required. Pull requests run `ci.yml` without `paths-ignore`, so docs-only PRs report every required check too. `pr-title` runs on `pull_request_target`, which uses the workflow from `main`, so it only reports once `pr-title.yml` is merged; mark it as required after that.

### Pinned actions

Every third-party action is pinned to a full commit SHA, with its version in a comment (`uses: owner/action@<sha> # v1.2.3`). A tag can be moved to other code at any time; a commit SHA can't. This is not hypothetical: in March 2026 the tags of `aquasecurity/trivy-action` were force-pushed to a credential-stealing commit (CVE-2026-33634), and every workflow that referenced the action by tag ran it. A unit test (`src/test/workflow-pins.test.ts`) fails on any unpinned `uses:` in `.github/workflows/`. Downloaded tools follow the same rule: gitleaks is fetched at a fixed version and checked against its SHA-256.

### Dependabot

`.github/dependabot.yml` proposes updates weekly for npm, Docker base images and GitHub Actions, one grouped PR per ecosystem (npm majors in their own group). Action updates keep the SHA pin and update the version comment. A seven-day cooldown keeps freshly published releases out until they have had time to be pulled if compromised; Node majors are ignored because moving off Node 24 is a deliberate change.

## Migrations: expand/contract

Deploys are start-first (the new container runs next to the old one) and a rollback never reverts the schema. Every migration must therefore work with the **previous** image still running:

1. **Expand:** add tables, or columns that are nullable or have a default. Ship code that writes both old and new shapes if needed.
2. **Contract:** drop or tighten the old columns in a **later** slice, once no running image reads them.

Never rename or drop a column, or add a `NOT NULL` column without a default, in the same release that stops using it.

## Deploy job

The CI job `deploy` runs on pushes to `main` only, after `publish` (which pushed the scanned image as `sha-<short>` and `main`). It runs in the GitHub environment `production`, which only deploys from `main` and holds its secrets:

| Secret                   | Holds                                                   |
| ------------------------ | ------------------------------------------------------- |
| `DOKPLOY_URL`            | Dokploy panel base URL, reachable only over the tailnet |
| `DOKPLOY_API_KEY`        | Dokploy API key for CI                                  |
| `DOKPLOY_APPLICATION_ID` | The Application's id                                    |
| `PRODUCTION_URL`         | Public base URL of the app                              |
| `TS_OAUTH_CLIENT_ID`     | Tailscale OAuth client (scope Auth Keys, tag `tag:ci`)  |
| `TS_OAUTH_SECRET`        | Its secret                                              |

Steps:

1. **Check secrets and mask hosts.** Fails naming every secret that is unset. Masks the hosts of both URLs, so they don't show up in logs even when a tool prints them on their own.
2. **Join the tailnet** as an ephemeral node tagged `tag:ci` (`tailscale/github-action` with the OAuth client). The tailnet policy lets `tag:ci` reach only the Dokploy panel port; the node goes away after the job.
3. **Deploy:** `POST <DOKPLOY_URL>/api/application.deploy` with the `x-api-key` header and `{"applicationId": …}`. Dokploy queues the deployment, pulls `:main` and updates the Swarm service.
4. **Verify:** polls `<PRODUCTION_URL>/api/health` every 10 s for up to 5 minutes until `commit` equals the pushed commit. If Swarm rolls back, or the rollout hangs, production keeps reporting the old commit and the job fails.

CI runs on `main` queue rather than cancel each other, so a deploy is never cut off mid-rollout (pull request runs still cancel superseded ones). If several merges land while one deploys, GitHub keeps only the newest pending run, and `:main` already holds the newest image.

A failed deploy can be retried by re-running the failed jobs of that workflow run, as long as no newer merge has moved `:main` since.

## Dokploy setup

Done once by hand; record names and facts only, never hostnames or URLs.

- **Project** with a Dokploy-managed **Postgres 18** database (no backups configured; see the [backup runbook](backup-restore.md)) and an **Application**:
  - Source **Docker**, image `ghcr.io/<OWNER>/my-notebook:main`, no registry credentials (the package is public).
  - **Autodeploy off**: only CI deploys, so production only ever runs an image that passed CI.
  - One replica; a domain with HTTPS on container port `3000`.
  - Environment: `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000`, `LOG_LEVEL=info`, `LLM_MODE` (`fake` until the spend caps were in place, now `real` with `ANTHROPIC_API_KEY`), `DATABASE_URL` (the database's internal URL), `IP_HASH_SECRET` (generated, 32+ characters).
- A dedicated **API key** for CI (`DOKPLOY_API_KEY`).
- The **Swarm settings** below in the Application's Swarm settings (Advanced tab).

### Swarm settings

Swarm gives a task with a health check the state _running_ only once the check passes. With start-first, the old container keeps serving until then; if the new one never gets healthy, the update fails and Swarm rolls back to the previous image.

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

Caps are environment variables (`SOURCE_TOKEN_CAP`, the Demo budget, the Daily allowance and the rate limits above). For a recording, raise `DEMO_BUDGET_DAILY_USD`, `DAILY_ALLOWANCE_USD` and the hourly rate limits; leave `DEMO_BUDGET_TOTAL_USD` below the Console workspace's spend limit. There is no operator bypass in code. To record a demo with higher limits:

1. Note the current values, then raise them in the Application's environment.
2. Deploy from Dokploy and wait until `/api/health` answers again.
3. Record.
4. Restore the noted values and deploy again. Don't leave raised caps on a public deployment.
