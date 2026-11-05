# CANDIDATES

These open `ready-for-agent` issues are ready to work on: none has an open blocking issue, and none has a PR waiting for a merge.

<candidates-json>

{{CANDIDATES}}

</candidates-json>

# TASK

Each chosen issue runs in its own sandbox at the same time, and each becomes its own PR. Choose the largest set of candidates that can run **in parallel without stepping on each other**.

Read each candidate with `gh issue view <id>`. Leave a candidate out of this round if it would likely:

- modify the same files or module as another chosen issue (merge conflicts between the PRs), or
- add a database migration while another chosen issue also adds one.

Real dependencies between issues are already handled by GitHub's blocking relationships, so don't infer any; only avoid file conflicts.

When two candidates collide, keep the lower issue number; the other runs in a later round.

# OUTPUT

Output your plan as a JSON object wrapped in `<plan>` tags, listing only the chosen issue ids:

<plan>
{"issues": [{"id": "42"}, {"id": "45"}]}
</plan>

Always choose at least one candidate.
