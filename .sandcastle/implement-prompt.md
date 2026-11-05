# TASK

Implement issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view {{TASK_ID}}`. Its body starts with `Part of #<n>`: that's the parent spec. Pull it in too (`gh issue view <n>`) and work within its decisions.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run tests. Don't push and don't open a PR: the loop does that after you finish.

# REBASE FIRST

Rebase needed: **{{REBASE}}**

If this says `yes`, this branch already has a PR that conflicts with `main`. Before anything else:

1. `git rebase origin/main` (the host has already fetched `origin`).
2. Resolve conflicts by reading both sides. For **database migrations**, never hand-merge the drizzle journal (`meta/_journal.json`) or snapshots: take `main`'s migrations, drop this branch's migration files and journal entries, finish the rebase, then run `pnpm db:generate` to regenerate this branch's migration on top of `main` and commit it.
3. Run the feedback loops below and fix anything the rebase broke.
4. If the issue's work is otherwise complete, stop here and output the completion signal.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task. Read `AGENTS.md`, `GLOSSARY.md`, `docs/adr/` and `.sandcastle/CODING_STANDARDS.md`.

Pay extra attention to test files that touch the relevant parts of the code.

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

For UI work, use the `frontend-design` skill.

# FEEDBACK LOOPS

Before committing, run `pnpm typecheck`, `pnpm lint` and `pnpm test` (skip any script `package.json` does not define yet) to ensure the tests pass. Postgres 18 is running in this sandbox with the databases from `DATABASE_URL` and `TEST_DATABASE_URL`.

# COMMIT

Make a git commit following `AGENTS.md`: a Conventional Commits subject (`<type>(<scope>): <description>`), then a short body with:

1. The task completed and `Refs #<issue>` (plus the parent spec issue)
2. Key decisions made
3. Blockers or notes for the next iteration

Never put hostnames, URLs of infrastructure, keys or client names in commits.

# THE ISSUE

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue: merging its PR closes it.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
