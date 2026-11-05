# my-notebook

## How this app is developed

This app is built mostly by AI coding agents, with a human steering the work.

- **Issues drive the work.** Specs and implementation tickets live in GitHub Issues. Tickets ready for an agent get the `ready-for-agent` label (see `docs/agents/`).
- **Sandcastle runs the build loop.** It picks the `ready-for-agent` tickets that have no open blocker, implements each one with Claude Code in a Docker sandbox, reviews it with the `code-review` skill, and opens one PR per ticket. CI checks the PR; the developer squash-merges it, which closes the ticket. Run `pnpm sandcastle:image` once (and after changing `.sandcastle/Dockerfile`), then `pnpm sandcastle`. The config is in `.sandcastle/`.
- **T3 Code is the ADE (agentic development environment).** All agent sessions run in T3 Code.
- **A remote T3 Code server does most of the work.** It runs 24/7, so agents keep working on tickets while the laptop is closed. The laptop and phone only connect to it to steer, review, and approve.
