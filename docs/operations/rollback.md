# Rollback

Production follows `main` ([ADR 0003](../adr/0003-ci-built-image-deployed-to-dokploy-with-rollback.md)). There are two ways back to a working release; neither undoes database migrations.

## Automatic: Swarm rollback

Every deploy is a start-first Swarm update with `FailureAction: rollback` and a health check on `/api/health` (settings in [deployment.md](deployment.md#swarm-settings)):

1. Swarm starts the new container next to the old one. The old one keeps serving.
2. The new container migrates and starts. If its health check doesn't pass within the start period plus three retries (a failed migration, an invalid environment, an unreachable database, a crash), the task fails.
3. The update fails and Swarm rolls the service back to the previous image. Nothing is switched over.
4. The CI `deploy` job keeps polling `/api/health`, sees the old commit for 5 minutes and fails, so the merge shows red on `main`.

Then fix forward with a new PR, or roll back by hand if `main` stays broken for a while.

The automatic rollback only catches releases that fail their health check. A release that is healthy but wrong (a broken page, a bad answer) needs the manual rollback below.

## Manual: redeploy an older image

Every build of `main` is in GHCR as an immutable `sha-<short>` tag. Production runs `:main`, so rolling back means pointing `:main` at an older build and redeploying:

1. Pick the last good commit, e.g. from `git log` on `main` or the previous green `deploy` run. Its image is `ghcr.io/<OWNER>/my-notebook:sha-<short>`.
2. Retag it as `main`, keeping its SBOM and provenance (needs a token with `write:packages`):

   ```sh
   docker buildx imagetools create \
     --tag ghcr.io/<OWNER>/my-notebook:main \
     ghcr.io/<OWNER>/my-notebook:sha-<short>
   ```

3. In Dokploy, click **Deploy** on the Application (or call `application.deploy` as the CI job does).
4. Check `<PRODUCTION_URL>/api/health` reports the **old** full commit.

The next merge to `main` moves `:main` again and deploys it, so land the fix (or a revert PR) before merging anything else.

## Migrations are not undone

Neither way reverts the database schema. Migrations run forward only, at container start; the older image runs against the newer schema. This is why every migration must be expand/contract ([deployment.md](deployment.md#migrations-expandcontract)): a schema that still works with the previous image keeps a rollback safe. If a migration itself is the problem, fix it forward with a new migration.
