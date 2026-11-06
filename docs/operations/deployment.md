# Deployment

How the app is built and shipped. Production runs the image CI builds ([ADR 0003](../adr/0003-ci-built-image-deployed-to-dokploy-with-rollback.md)); the deploy and rollback steps are added by the Deploy pipeline slice.

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

An invalid environment makes the server exit at start instead of serving errors.

### CI smoke check

The `image` job loads the built image, starts it against the job's Postgres service and polls `/api/health` until it answers `200` with `commit` equal to the build's commit. This also runs every migration against an empty database.

## Migrations: expand/contract

Deploys are start-first (the new container runs next to the old one) and a rollback never reverts the schema. Every migration must therefore work with the **previous** image still running:

1. **Expand:** add tables, or columns that are nullable or have a default. Ship code that writes both old and new shapes if needed.
2. **Contract:** drop or tighten the old columns in a **later** slice, once no running image reads them.

Never rename or drop a column, or add a `NOT NULL` column without a default, in the same release that stops using it.
