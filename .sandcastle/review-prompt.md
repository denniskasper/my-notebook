# TASK

Review the work on branch `{{BRANCH}}` for issue {{TASK_ID}} before it becomes a PR, and fix what the review finds.

# REVIEW

Call the Skill tool with `code-review`. The fixed point is `origin/main`; the originating issue is #{{TASK_ID}} (its parent spec is linked at the top of its body). The repo's coding standards are in `.sandcastle/CODING_STANDARDS.md` and `AGENTS.md`.

# FIX

For each finding:

- **Fix it** if you agree it's a real defect or a standards/spec gap. Preserve behaviour unless the finding is that the behaviour is wrong.
- **Skip it** if it's wrong or not worth the change, and say why in one line.

After fixing, run `pnpm format`, `pnpm typecheck`, `pnpm lint` and `pnpm test` (skip any script `package.json` does not define yet) and commit with a Conventional Commits subject, for example `refactor(chat): apply code review`. Don't push.

# OUTPUT

Summarize the review for the PR description, wrapped in `<review>` tags: one line per axis (Standards, Spec) with the verdict, then the findings as a short list, each marked fixed or skipped (with the reason). No hostnames, keys or client names.

<review>
**Standards:** 2 findings, both fixed.
**Spec:** all acceptance criteria met.

- Fixed: German string literal in `SourceList` moved to `strings.ts`.
- Skipped: "extract the SSE parser": used once, not worth a module yet.
</review>
