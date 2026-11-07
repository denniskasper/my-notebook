# my-notebook

## How this app is developed

This app is built mostly by AI coding agents, with a human steering the work.

- **Issues drive the work.** Specs and implementation tickets live in GitHub Issues. Tickets ready for an agent get the `ready-for-agent` label (see `docs/agents/`).
- **Sandcastle runs the build loop.** It picks the `ready-for-agent` tickets that have no open blocker, implements each one with Claude Code in a Docker sandbox, reviews it with the `code-review` skill, and opens one PR per ticket. CI checks the PR; the developer squash-merges it, which closes the ticket. Run `pnpm sandcastle`; it rebuilds the sandbox image first, since the server's Docker cleanup can delete it between runs. The config is in `.sandcastle/`.
- **T3 Code is the ADE (agentic development environment).** All agent sessions run in T3 Code.
- **A remote T3 Code server does most of the work.** It runs 24/7, so agents keep working on tickets while the laptop is closed. The laptop and phone only connect to it to steer, review, and approve.

## Local development

Requires Node 24, pnpm (via corepack) and Docker.

```sh
cp .env.example .env
docker compose up -d          # Postgres 18 with the dev and _test databases
pnpm install
pnpm db:migrate               # apply the committed SQL migrations
pnpm dev
```

| Script | What it does |
| --- | --- |
| `pnpm typecheck` | TypeScript 7 (`tsc`) over the app and `.sandcastle` |
| `pnpm lint` / `pnpm format:check` | ESLint (incl. module boundaries) and Prettier |
| `pnpm test` | Vitest unit tests and integration tests against `TEST_DATABASE_URL` |
| `pnpm test:e2e` | Playwright against a production build on the `_test` database |
| `pnpm db:generate` | Generate a migration from the modules' `schema.ts` files |
| `pnpm demo:seed` | Seed a demo Notebook into the local database (see `demo/README.md`) |

`GET /api/health` reports the database ping, version and running commit.
