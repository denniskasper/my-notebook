# Research: CI/CD and deployment to Dokploy (issue #6)

Researched 2026-11-02. Reference: the sibling project (a pnpm monorepo deployed on Dokploy), read-only.
External facts come from first-party docs, listed under Sources. Placeholders: `<DOKPLOY_URL>`, `<APP_ID>`, `<DOMAIN>`.

## Summary and recommendation

- **Build in CI, run on Dokploy.** GitHub Actions tests, builds one image (Next.js `output: 'standalone'` + the Agent SDK's bundled Claude Code binary) and pushes it to **GHCR**. Dokploy only pulls and runs it. Dokploy's own docs recommend this for production ([going-production][dk-prod]).
- **One Dokploy *Application* (Docker image source) and one Dokploy-managed *Postgres* database**, not a Compose service. Applications get health-check-gated zero-downtime deploys with automatic rollback through Swarm settings ([zero-downtime][dk-zd], [rollbacks][dk-rb]). Managed databases get scheduled S3 backups and a restore button ([backups][dk-bk], [restore][dk-rs]). The docs do not show these features for Compose.
- **Deploys are triggered from CI** with `POST /api/application.deploy` and an `x-api-key` header ([auto-deploy][dk-ad]), only after every check passes. Dokploy's own Autodeploy stays off. This is the sibling project's pattern.
- **Adopt from the sibling project:** the CI shape (concurrency, real Postgres service container, image build with GHA cache, deploy gated on green); release-please plus a Conventional Commits changelog; the PR-title guard; secrets that live only in Dokploy; the outside uptime check. **Skip:** the "already-green tree marker", test sharding, the `release` branch indirection and the Compose-based stacks.
- **Migrations:** a one-shot `migrate` step runs before the new container takes traffic. It can run at container start, as in the sibling project, if migrations stay backward compatible (expand/contract), because `start-first` overlaps the old and new containers.
- **Rollback:** automatic through Swarm `FailureAction: rollback` when the health check fails. A manual rollback runs a `workflow_dispatch` that points the deploy tag back at an older immutable `sha-` or `vX.Y.Z` image and calls `application.deploy`.
- **Cheap extras worth doing in the 7-day build (about 10 h total):** Dependabot, gitleaks, Trivy image scan, `/api/health`, pino JSON logs, an external uptime check, Dokploy Postgres backups plus one restore drill, and a small LLM cost table and page. Preview deploys and a full metrics stack can wait or stay documentation-only.

## Sibling project inventory (paths relative to that repo)

| Path | What it does |
| --- | --- |
| `.github/workflows/ci.yml` | Runs on push to `main`, on `pull_request` (both `paths-ignore` docs/`*.md`) and on `workflow_dispatch`. `concurrency` cancels superseded runs. Jobs: an `already-green` lookup (skips re-testing a merge whose git tree already passed, using an artifact named after the tree); `check` (typecheck, lint, prettier); API tests sharded ×2 and Playwright e2e sharded ×6, each against a `postgres:18-alpine` **service container** with a `pg_isready` health check; `image` (buildx build, `push: false`, `cache-from/to: type=gha`, base images pulled from a Docker Hub mirror to dodge rate limits); `green` (uploads the marker); `deploy-preview` (main only, gated on every job). The deploy job joins a private network over an ephemeral Tailscale node, then `curl`s Dokploy's `compose.deploy` with an API key. URL, key and service id are repository secrets, and the host is masked in the logs. |
| `.github/workflows/release.yml` | On push to `main`, runs `googleapis/release-please-action` (pinned to v5 there) with `contents/pull-requests/issues: write` and non-cancelling concurrency. When a release is cut, it force-moves a `release` branch to the new tag, because Dokploy follows a branch and cannot follow a tag. Production follows `release`. |
| `.github/workflows/pull-request-title.yml` | Fails a PR whose title starts with a Conventional Commit type, so a merge-commit body can't double-count in release-please. |
| `release-please-config.json`, `.release-please-manifest.json`, `CHANGELOG.md` | Single root package (`release-type: node`), `bump-minor-pre-major`, custom changelog sections (`feat` → "New", `fix` → "Fixed", the rest hidden). |
| `Dockerfile` | Multi-stage on `node:24-bookworm-slim`: deps (pnpm store cache mount) → build → `pnpm deploy --prod` → runtime as `USER node`. A separate stage writes the git commit, taken from a `COMMIT` build arg or a `.git` build context, into the image so the footer shows `version · sha`. Drizzle SQL ships in the image so the app can migrate itself. A `VOLUME` holds files. The Agent SDK and Claude Code are deliberately **not** in its runtime image. |
| `docker/preview/compose.yml`, `docker/<prod>/compose.yml` | Dokploy Compose stacks (app + Postgres 18, named volumes, `${VAR:?required}` so a missing secret fails the deploy, `expose` only with Traefik doing TLS). `MIGRATE_ON_START=true`, so migrations run before the app listens. |
| `docker-compose.yml`, `docker/postgres-init/` | Local dev Postgres on a non-default host port. The init SQL creates a separate `_test` database. |
| `docs/adr/0009-deployment.md` (amended), `0011`, `0016` | One VPS on Dokploy/Traefik. Nightly encrypted restic backups go offsite, and a restore is actually performed. External uptime check on `/api/status` (DB-reachable). Push-style backup heartbeat. Server config (daemon log driver, journald retention, Traefik static config) kept as code in a separate private infra repo. No error-tracking vendor: pino logs on the box. Versions come from commit types, and production runs only releases. |
| `docs/operations/*.md` | Runbooks: preview and prod deployment, releases, 30-day log retention through journald, backup and restore drill, rollback (`git push --force 'vX^{commit}:refs/heads/release'`, then Deploy). |
| `scripts/prepare-env.mjs` | Copies `.env.example` to `.env` on first run (one-command setup). |

## Adopt / adapt / skip

| Sibling practice | Verdict | Why, for a single Next.js + Postgres + Agent SDK app |
| --- | --- | --- |
| PR + main CI triggers, `paths-ignore` docs, `concurrency` cancel | **Adopt** | Free and standard ([Actions billing][gh-bill]: standard runners are free for public repos). |
| `check` job (typecheck/lint/format) | **Adopt** | Same tooling. |
| Postgres service container with health check, mirror image | **Adopt** | Real-DB integration tests. The mirror trick avoids Docker Hub's anonymous pull limits. |
| Test sharding ×2 / ×6 | **Skip** | A 7-day codebase doesn't need it. Add it if e2e passes about 8 minutes. |
| `already-green` tree marker | **Skip** | Clever, but complex. Building the image once on main and promoting it gets the same "deploy exactly what was tested" guarantee more simply. |
| Image build in CI with GHA cache | **Adapt** | Also **push** to GHCR (`sha-<short>`, `main`, `vX.Y.Z` tags), and add `org.opencontainers.image.source` + revision labels ([GHCR][gh-ghcr]). |
| Dokploy builds from git (Compose) | **Skip** | Build on CI and pull on the server. This keeps VPS CPU free and makes rollback a retag ([going-production][dk-prod]). |
| Deploy job: curl the Dokploy API, secrets in repo secrets, mask host | **Adopt** | Use `application.deploy` instead of `compose.deploy`. Keep the "fail if a secret is unset" guard. |
| Ephemeral Tailscale node to reach a private panel | **Adapt** | Use it only if the panel is private. A public panel with 2FA and an API key over HTTPS is simpler (open question). |
| release-please + changelog sections + PR-title guard | **Adopt** | Showcase value, about 1 h. Note: the GITHUB_TOKEN-created release PR doesn't trigger CI ([release-please-action][rp]). |
| `release` branch that production follows | **Skip** | Only needed because Dokploy-from-git can't pin a tag. With image deploys, the tag *is* the pin. |
| Commit baked into image, `/api/status` returns version + commit + DB | **Adopt** | Pass `COMMIT=${{ github.sha }}` as a build arg. Cheap, and deploy checks become verifiable. |
| `MIGRATE_ON_START` | **Adapt** | Fine with one replica, but `start-first` overlap needs expand/contract migrations. Alternative: a separate migrate entrypoint (see pipeline). |
| `${VAR:?required}` fail-fast env | **Adapt** | Use zod env validation at boot. Dokploy's env editor holds secrets. |
| restic nightly offsite + restore drill | **Adapt** | Use Dokploy's built-in Postgres → S3 backups. Keep the documented, performed restore drill. |
| Server config as code in a separate infra repo; journald retention | **Doc-only** | Mention it and link it from the ops doc. Don't build it in 7 days. |
| No error-tracking vendor | **Adopt** | pino JSON to stdout. Revisit after launch. |
| Runbooks in `docs/operations/` | **Adopt** | `deployment.md`, `rollback.md`, `backup-restore.md`. High interview value. |

## Dokploy deployment facts (verified)

- **Trigger methods:** Git provider push, webhook URL, DockerHub webhook (applications only, tag must match), or the API. Auto deploy applies to Applications and Compose. API: `POST /api/application.deploy` with `{"applicationId": "<APP_ID>"}`, header `x-api-key`. Tokens come from Profile → API/CLI ([auto-deploy][dk-ad], [API][dk-api]). Swagger is available at `<DOKPLOY_URL>/swagger` for admins ([API][dk-api]).
- **Build in CI, run an image:** create an Application with Source Type **Docker** and the image name, then trigger it from CI through the API. The docs also mention a community GitHub Action ([going-production][dk-prod]).
- **Zero downtime:** without a health check, Swarm stops the old container while it starts the new one, which can cause 502s. Configure a `HealthCheck` (`curl -f http://localhost:3000/health`, nanosecond intervals) under Advanced → Cluster Settings → Swarm Settings. **`curl` must be in the image** ([zero-downtime][dk-zd]).
- **Rollback:** (1) automatic: Swarm `UpdateConfig` with `"FailureAction": "rollback"` and `"Order": "start-first"`; (2) registry-based manual rollback to any earlier deployment, which needs a configured registry (Deployments → Rollback Settings) ([rollbacks][dk-rb]).
- **Preview deployments:** for **Applications with GitHub integration**. Off by default, triggered by PRs to the target branch, optionally label-gated, rebuilt per commit, removed on close. They use `*.traefik.me` or a wildcard DNS record, with a default limit of 3. **The docs advise against previews on public repositories**, because outsiders could trigger builds on your server ([previews][dk-pv]).
- **Compose services:** env vars go to `.env` and are *not* injected automatically (use `${VAR}`/`env_file`). Use named volumes for data, because only named volumes are covered by Volume Backups. Stack mode drops `build` ([compose][dk-cmp]). The Compose docs don't mention zero-downtime, rollback or previews (**unverified for Compose**).
- **Backups:** Dokploy-managed databases back up to an S3 destination on a cron schedule, with a Test button. Restore is a UI flow for **PostgreSQL**/MySQL/MariaDB/MongoDB ([backups][dk-bk], [restore][dk-rs]). Retention settings aren't described on that page (**unverified**). Volume Backups: named volumes only, optional container stop, restore into a new volume ([volume backups][dk-vb]).
- **Monitoring:** per-service CPU, memory, disk and network graphs in the UI ([applications][dk-app]). The monitoring page with thresholds and alerts states it is "only available on Cloud Version of Dokploy" (**ambiguous for self-hosted, verify on the instance**) ([monitoring][dk-mon]).

### Agent SDK runtime facts that affect the image

- The SDK spawns a `claude` CLI subprocess over stdio. Node.js 18.14+ is required. **The TypeScript SDK bundles a native Claude Code binary**, version-pinned to the SDK, so there's no separate global CLI install. Don't drop optional dependencies during the image build. Use a glibc base (`node:24-bookworm-slim`), because the binary must match the container's architecture and libc ([hosting][sdk-host]).
- Session transcripts live in `~/.claude/projects/` (or `CLAUDE_CONFIG_DIR`) and are lost on redeploy unless they're mounted or mirrored through a `SessionStore`. The runtime user needs a writable HOME/`CLAUDE_CONFIG_DIR`. Use `settingSources: []` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` to isolate users ([hosting][sdk-host]).
- Starting point: 1 GiB RAM and 1 CPU per concurrent agent session. Token cost dwarfs container cost. OTEL export comes from env vars (`CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_*`) ([hosting][sdk-host]).

## DevOps practice survey

Effort is for one developer on this stack, in hours, excluding learning time.

| Practice | What | Effort (h) | Showcase value | Recommend |
| --- | --- | --- | --- | --- |
| CI: check + tests with Postgres service + image build | Sibling-shaped `ci.yml` | 2–3 | High (baseline) | **Yes** |
| Image to GHCR, deploy via Dokploy API | buildx push, `sha-`/`main`/`vX` tags, `application.deploy` | 2 | High | **Yes** |
| Health check + zero-downtime + auto rollback | `/api/health` (DB ping), Swarm HealthCheck + UpdateConfig JSON, `curl` in image | 1.5 | High (demo a failed deploy rolling back) | **Yes** |
| Manual rollback workflow | `workflow_dispatch` with an input tag: retag to the deploy tag (`docker buildx imagetools create`), call deploy | 1 | High | **Yes** |
| Migrations as a gated step | Drizzle/Prisma migrate entrypoint, expand/contract rule in docs | 1 | Medium-high | **Yes** |
| Release automation + changelog | release-please + PR-title guard (copy the sibling's) | 1 | Medium-high | **Yes** |
| Dependency updates | Dependabot `npm`, `docker`, `github-actions`, weekly, grouped ([Dependabot][gh-dbot]) | 0.5 | Medium | **Yes** |
| Secret scanning | GitHub secret scanning (free on public repos [gh-ss]) + gitleaks-action v3 in CI (no license needed for personal accounts [gl]) | 0.5 | Medium | **Yes** |
| Image/dep vuln scan | Trivy (image + fs, SARIF to code scanning). **Pin actions by full SHA**: `trivy-action` was compromised in March 2026 (CVE-2026-33634, [advisory][trivy-adv]) | 1 | Medium-high (and a good supply-chain talking point) | **Yes** |
| Structured logs | pino JSON to stdout, request id, log the agent session id | 1 | Medium | **Yes** |
| Uptime monitoring | External check on `/api/health`: a free uptime service or Uptime Kuma on a *different* host | 0.5–1 | Medium | **Yes** |
| LLM cost dashboard | Persist `total_cost_usd`/token usage per Agent/Chat run (SDK result message) to a table, plus an admin page or SQL view, plus a budget alert | 3–4 | **High** (domain-specific) | **Yes (minimal)** |
| Postgres backups + restore drill | Dokploy DB backup → S3-compatible bucket nightly, one performed restore documented | 1.5–2 | High | **Yes** |
| Metrics / tracing stack | OTEL collector + Grafana/Prometheus or Grafana Cloud free tier. SDK can export OTEL natively | 4–8 | Medium-high | **Later** |
| Preview deploys | Dokploy Application previews per PR. Needs GitHub-provider build on the server and wildcard DNS, and the docs warn against public repos | 2–4 | Medium | **Later** (label-gated, owner-only) or **doc-only** |
| Staging environment | Second Dokploy app + DB from the same image, promote tag | 1.5 | Medium | **Later** |
| Config as code (Dokploy) | Export Swarm JSON, env var *names*, and app/DB settings into `docs/operations/` or a script against the Dokploy API | 1–2 | Medium | **Doc-only now** |
| Config as code (server) | Ansible/cloud-init for VPS hardening, daemon.json, journald retention (sibling keeps these in a private infra repo) | 4–8 | Medium | **Doc-only / later** |
| SBOM + provenance | `docker/build-push-action` `sbom: true`, `provenance: mode=max`, or `actions/attest-build-provenance` | 0.5 | Medium | **Later** (cheap add-on) |
| E2E smoke after deploy | Poll `/api/health` until it returns the new commit, then a Playwright smoke against prod | 1 | Medium-high | **Yes** (poll only) |

Recommended "yes" items total about 17–20 h. The minimum credible set (CI, GHCR, deploy, health/rollback, migrations, release-please, Dependabot, gitleaks, backups) is about 10 h.

## Recommended pipeline

**Workflows (`.github/workflows/`):**

1. `ci.yml`, on `pull_request` and `push: main` (`paths-ignore: docs/**, **/*.md`), plus `workflow_dispatch`. `concurrency: ${{ github.workflow }}-${{ github.ref }}`, cancel in progress.
   - `check`: pnpm install, typecheck, lint, format check.
   - `test`: Postgres 18 service container (mirror image), run migrations, then unit + integration tests (Vitest). Playwright e2e against `next start` if it is ready by day 5. LLM calls are faked by default. No real API key in CI.
   - `security`: gitleaks (full history), `pnpm audit --prod` or Trivy fs. Pin every third-party action by SHA.
   - `image`: buildx with GHA cache. On PR, `push: false` plus a Trivy image scan (fail on CRITICAL with a fix available). On `main`, push `ghcr.io/<OWNER>/my-notebook:sha-<short>` and `:main`, with build arg `COMMIT`. Needs `permissions: packages: write`.
   - `deploy` (main only, `needs: [check, test, security, image]`, `environment: production` for the protected secrets and the deployment log in GitHub): `curl --fail-with-body -X POST <DOKPLOY_URL>/api/application.deploy -H "x-api-key: …" -d '{"applicationId":"<APP_ID>"}'`, then poll `https://<DOMAIN>/api/health` until `commit == github.sha` (timeout about 5 min) and fail the job otherwise.
2. `release.yml`, on `push: main`. release-please (single node package, sibling config). When `release_created`, retag the already-built `sha-<short>` image as `vX.Y.Z` (`docker buildx imagetools create`, no rebuild).
3. `pr-title.yml`: copy the sibling's guard.
4. `rollback.yml`, `workflow_dispatch` with input `tag` (`vX.Y.Z` or `sha-…`): retag that image to the tag Dokploy runs (`:main`, or a dedicated `:production`), call `application.deploy`, then poll health. Document that a rollback does not reverse migrations.
5. `.github/dependabot.yml`: npm, docker and github-actions, weekly, grouped.

**Dokploy setup (documented in `docs/operations/deployment.md`, values never committed):**
- Application, Source **Docker**, image `ghcr.io/<OWNER>/my-notebook:main` (make the GHCR package public, or add registry credentials). Autodeploy **off**. Domain `<DOMAIN>` on port 3000 with HTTPS.
- Swarm Settings: HealthCheck JSON (`curl -f http://localhost:3000/api/health`) and UpdateConfig `{"Parallelism":1,"Order":"start-first","FailureAction":"rollback"}`. Replicas stay at 1.
- Volume mount for `CLAUDE_CONFIG_DIR` (and any working directories) if agent sessions must survive deploys. Otherwise persist transcripts or results in Postgres.
- Dokploy-managed **Postgres** database (not a Compose sidecar), with a nightly S3 backup and one restore drill before the demo.
- Env in Dokploy's editor: `DATABASE_URL`, `ANTHROPIC_API_KEY` (in a Console workspace with a spend limit), auth secret, `LOG_LEVEL`.

**Image:** `node:24-bookworm-slim`. Stages: deps (pnpm, optional deps **kept** for the bundled Claude Code binary) → `next build` with `output: 'standalone'` → runtime copies `.next/standalone`, `.next/static`, `public` ([Next.js output][next-out]), migrations, and the migrate script. Use `outputFileTracingIncludes` if the SDK's binary isn't traced. Install `curl`. `USER node`. `HOSTNAME=0.0.0.0 PORT=3000 node server.js`.

**Migrations:** the entrypoint runs `node migrate.js && node server.js` (one replica, idempotent, wrapped in a Postgres advisory lock). Rule: every migration is backward compatible with the previous release (expand, deploy, contract), because `start-first` runs old and new side by side and rollback doesn't revert schema. Take a manual Dokploy backup before any destructive migration.

**Rollback paths:** (a) automatic Swarm rollback when the health check fails; (b) `rollback.yml` to any `vX.Y.Z` or `sha-` tag; (c) data: restore from a Dokploy S3 backup.

## Open questions

1. Is the Dokploy panel public (2FA plus a scoped API key) or private (needs a Tailscale-style ephemeral runner join, as in the sibling project)?
2. Does production follow `main` (simpler, showcase app) or only releases (`:vX.Y.Z`, sibling-style)? This doc assumes `main`, with tags for traceability.
3. Which S3-compatible bucket holds backups? It should be off-box and from a different provider.
4. Must agent session transcripts survive redeploys (volume or `SessionStore`), or is persisting final outputs in Postgres enough?
5. Does the self-hosted Dokploy version expose server-level alerting? The monitoring docs say cloud-only. Verify on the instance.
6. Does Next's output tracing copy the SDK's platform-specific native binary into `standalone`? Verify in the first image build (`docker run … ls node_modules/@anthropic-ai`).
7. Is Dokploy's API endpoint for changing an Application's image tag (needed if rollback should pin a tag instead of retagging) unverified? Check `/swagger` on the instance.

## Sources

- Sibling project (local, read-only): `.github/workflows/{ci,release,pull-request-title}.yml`, `Dockerfile`, `docker/*/compose.yml`, `docker-compose.yml`, `release-please-config.json`, `docs/adr/0009-deployment.md`, `docs/adr/0011-no-error-tracking-vendor.md`, `docs/adr/0016-*.md`, `docs/operations/{preview-deployment,log-retention} and the production-deployment runbook.md`, `apps/api/src/main.ts`.
- [dk-ad]: https://docs.dokploy.com/docs/core/auto-deploy
- [dk-api]: https://docs.dokploy.com/docs/api
- [dk-prod]: https://docs.dokploy.com/docs/core/applications/going-production
- [dk-zd]: https://docs.dokploy.com/docs/core/applications/zero-downtime
- [dk-rb]: https://docs.dokploy.com/docs/core/applications/rollbacks
- [dk-pv]: https://docs.dokploy.com/docs/core/applications/preview-deployments
- [dk-app]: https://docs.dokploy.com/docs/core/applications
- [dk-cmp]: https://docs.dokploy.com/docs/core/docker-compose
- [dk-bk]: https://docs.dokploy.com/docs/core/databases/backups
- [dk-rs]: https://docs.dokploy.com/docs/core/databases/restore
- [dk-vb]: https://docs.dokploy.com/docs/core/volume-backups
- [dk-mon]: https://docs.dokploy.com/docs/core/monitoring
- [sdk-host]: https://code.claude.com/docs/en/agent-sdk/hosting
- [next-out]: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- [gh-ghcr]: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- [gh-bill]: https://docs.github.com/en/actions/concepts/billing-and-usage (Actions free on standard runners for public repos). Packages/GHCR free for public packages: https://docs.github.com/en/billing/concepts/product-billing/github-packages
- [gh-dbot]: https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuring-dependabot-version-updates
- [gh-ss]: https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning
- [rp]: https://github.com/googleapis/release-please-action (README shows `@v4`, while the sibling project pins `@v5`. Check the latest tag before pinning.)
- [gl]: https://github.com/gitleaks/gitleaks-action
- [trivy-adv]: https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23 (details also from third-party summaries, which I didn't fully verify against the advisory); Trivy docs: https://trivy.dev/latest/docs/

**Unverified or flagged:** Compose support for zero-downtime, rollback and previews; Dokploy backup retention; self-hosted monitoring alerts; an API endpoint to change the image tag; the exact safe trivy-action SHA; whether Dependabot is free (assumed from GitHub's general free-for-public stance, not confirmed on the fetched page).

[dk-ad]: https://docs.dokploy.com/docs/core/auto-deploy
[dk-api]: https://docs.dokploy.com/docs/api
[dk-prod]: https://docs.dokploy.com/docs/core/applications/going-production
[dk-zd]: https://docs.dokploy.com/docs/core/applications/zero-downtime
[dk-rb]: https://docs.dokploy.com/docs/core/applications/rollbacks
[dk-pv]: https://docs.dokploy.com/docs/core/applications/preview-deployments
[dk-app]: https://docs.dokploy.com/docs/core/applications
[dk-cmp]: https://docs.dokploy.com/docs/core/docker-compose
[dk-bk]: https://docs.dokploy.com/docs/core/databases/backups
[dk-rs]: https://docs.dokploy.com/docs/core/databases/restore
[dk-vb]: https://docs.dokploy.com/docs/core/volume-backups
[dk-mon]: https://docs.dokploy.com/docs/core/monitoring
[sdk-host]: https://code.claude.com/docs/en/agent-sdk/hosting
[next-out]: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
[gh-ghcr]: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
[gh-bill]: https://docs.github.com/en/actions/concepts/billing-and-usage
[gh-dbot]: https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuring-dependabot-version-updates
[gh-ss]: https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning
[rp]: https://github.com/googleapis/release-please-action
[gl]: https://github.com/gitleaks/gitleaks-action
[trivy-adv]: https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23
