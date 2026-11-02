# my-notebook

## How this app is developed

This app is built mostly by AI coding agents, with a human steering the work.

- **Issues drive the work.** Specs and implementation tickets live in GitHub Issues. Tickets ready for an agent get the `ready-for-agent` label (see `docs/agents/`).
- **Sandcastle runs the build loop.** It plans the `ready-for-agent` tickets, implements each one with Claude Code in a Docker sandbox, reviews the result, and merges it. The config is in `.sandcastle/`.
- **T3 Code is the ADE (agentic development environment).** All agent sessions run in T3 Code.
- **A remote T3 Code server does most of the work.** It runs 24/7, so agents keep working on tickets while the laptop is closed. The laptop and phone only connect to it to steer, review, and approve.
