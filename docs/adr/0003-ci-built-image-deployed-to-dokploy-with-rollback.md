# Image built in CI, deployed to Dokploy with automatic rollback

GitHub Actions builds and scans the container image, pushes it to GHCR and then tells Dokploy to deploy that exact image; Dokploy's own Git autodeploy stays off. Swarm runs the new container next to the old one (start-first) and rolls back automatically when `/api/health` fails, and CI only goes green once production reports the new commit. Building in CI keeps tests, scans, SBOM and the deployed artifact in one auditable pipeline, and the self-hosted server keeps hosting cost at zero.

## Considered Options

- **Dokploy builds from Git** on push: simpler, but the deployed image is not the one CI tested and scanned, and CI cannot tell whether the deploy worked.
- **A managed platform** (Vercel, Fly.io): less to operate, but no Postgres backups, rollback or networking to show in an engineering demo.

## Consequences

- Every migration must be expand/contract-compatible with the previous image: start-first runs both side by side, and a rollback never reverts schema.
- Production follows `main`; there are no version tags or release branches.
