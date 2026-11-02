# AGENTS.md

Guidelines for AI agents working in this repository.

## Security

- **Never** leak or commit sensitive information, including:
  - Client names
  - Admin names
  - Passwords, tokens, and API keys
  - Environment details (hostnames, URLs, infrastructure configuration)
- Use placeholders (for example, `<CLIENT>`, `<ADMIN_USER>`) when an example needs one of the values above.

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/) with a short subject line.
- Format: `<type>(<optional scope>): <description>`
- Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Examples:

```
feat(auth): add session refresh
fix: handle empty response body
docs: update setup instructions
```

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `denniskasper/my-notebook` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus `spec` for specification issues. See `docs/agents/triage-labels.md`.

### Domain docs

Single context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## UI and design

- **Always use the `/frontend-design` skill** for any UI or design work — new components, pages, layout, styling, or beautifying existing screens.
