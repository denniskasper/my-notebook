# Coding Standards

The reviewer checks every slice against these, alongside `AGENTS.md`, `GLOSSARY.md`, `docs/adr/` and the parent spec issue.

## Architecture

- **Module boundaries.** Code lives in `src/modules/<module>/` (visitors, notebooks, sources, chat, notes, agent, studio, usage). A module's `index.ts` is its only public surface: `src/app` and other modules import a module only through it. Each module owns its Drizzle tables in its `schema.ts`.
- **`src/platform` imports no module.** It holds db, llm, env, logging and http/sse helpers. `src/app` stays thin: routes, layouts and Route Handlers call into modules.
- **The `llm` boundary.** Every call to Claude goes through `src/platform/llm`. Tests use its scripted fake (`LLM_MODE=fake`); no test, CI job or e2e run calls the real API or needs a key.
- **Zod at every trust boundary:** env at boot, Server Action and Route Handler input, SSE events, tool input, jsonb read from the database.
- **Names follow `GLOSSARY.md`** (Notebook, Source, Passage, Citation, Note, Agent run, Step, Visitor…) in code, tables and tests. Avoid the listed synonyms.

## Data

- **Migrations are expand/contract.** Every migration must work with the previous image still running (deploys are start-first, rollbacks don't revert schema): add columns nullable or with defaults, drop in a later slice.
- **Migration conflicts are regenerated, never hand-merged.** On a conflict with `main`, take `main`'s migrations and run `pnpm db:generate` again for this branch's schema change.
- Local databases: `DATABASE_URL` (dev) and `TEST_DATABASE_URL` (integration tests), both Postgres 18.

## UI

- **German UI text lives only in `src/ui/strings.ts`.** No German literals in components; server errors travel as codes and are mapped to strings there.
- Use the `frontend-design` skill for UI work. Follow variant D of the layout prototype: graphite dark, hairline borders, amber only for Citations, periwinkle only for Agent mode.
- Each slice owns its empty, loading and error states, at the polish tier the slice states:
  - **Must be polished:** Citation → Passage highlight, Chat streaming, the Agent Step timeline, Source status transitions, the three-panel layout.
  - **May be rough:** Notebook rename/delete, the Notes editor beyond save + Citation click, states off the demo path, Briefing styling.

## Testing

- Every slice ships: unit tests for its pure logic, integration tests for its module's `index.ts` against the real `_test` database, and one Playwright happy path through the faked `llm`.
- Test behaviour through public interfaces; no mocks of internal collaborators. The only test double is the `llm` fake.
- No coverage threshold.

## Done

A slice is done when its acceptance criteria are met, CI is green on its PR, and (once the deploy pipeline exists) production's `/api/health` reports the merge commit.

## Style

- TypeScript strict; no `any` and no unchecked casts at boundaries (parse with Zod instead).
- Prefer named exports. Keep functions small and explicit over clever; avoid nested ternaries.
- Comments explain *why*, not *what*.

## Security and public repo

- Never commit hostnames, URLs of infrastructure, keys, tokens or client names; use placeholders such as `<HOST>`. Env vars are referenced by name only.
- Mutating requests rely on the `SameSite=Lax` Visitor cookie plus the Origin check; don't add endpoints that bypass them.
- Anything that fetches a URL goes through the SSRF-guarded fetcher.
