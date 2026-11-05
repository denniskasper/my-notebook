# TASK

Write the pull request for branch `{{BRANCH}}`, which implements issue #{{TASK_ID}}. Don't change any code and don't create the PR: the loop opens it with what you output.

# CONTEXT

Read the issue with `gh issue view {{TASK_ID}}`.

## Commits on this branch

!`git log origin/main..{{BRANCH}} --format="%h %s%n%n%b"`

## Changed files

!`git diff --stat origin/main...{{BRANCH}}`

Read the full diff with `git diff origin/main...{{BRANCH}}` as needed.

# WRITE

- **Title:** one Conventional Commits subject, `<type>(<optional scope>): <description>`, lower case, imperative, at most 72 characters. It becomes the squash commit on `main`, so it describes the whole change (usually `feat` for a slice).
- **Body:** call the Skill tool with `pr` and follow it. The code-review summary and `Closes #{{TASK_ID}}` are appended for you; don't add them. No hostnames, URLs of infrastructure, keys or client names. End with:

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

# OUTPUT

Output a JSON object wrapped in `<pr>` tags (escape newlines in the body as `\n`):

<pr>
{"title": "feat: add walking skeleton", "body": "## Summary\n\n..."}
</pr>
