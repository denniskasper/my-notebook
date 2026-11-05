// Sandcastle build loop: plan → implement → review → open a PR, per issue.
//
//   Select:    the host lists open `ready-for-agent` issues and keeps the ones
//              with no open native blocker and no PR waiting for a merge
//              (workflow.ts). A PR that conflicts with main brings its issue
//              back to be rebased.
//   Plan:      with several candidates, an opus agent picks the ones that can
//              run in parallel without touching the same files.
//   Implement: per issue, a Docker sandbox on `sandcastle/issue-<n>` runs the
//              implementer (and, for a fresh branch, the reviewer, who runs the
//              `code-review` skill, and the PR writer).
//   Publish:   the host pushes the branch and opens the PR, which closes the
//              issue when the developer squash-merges it. Sandcastle never
//              merges.
//
// The loop repeats until no candidate is left that hasn't been tried in this
// process. Issues unblocked by a merge are picked up by the next run.
//
// Usage: pnpm sandcastle  (build the image first: pnpm sandcastle:image)

import { resolve } from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { z } from "zod";
import * as github from "./github.ts";
import {
  buildPullRequest,
  type Candidate,
  lastTagContent,
  selectCandidates,
} from "./workflow.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Logs: one folder per issue instead of one flat folder for everything.
//   .sandcastle/logs/issue-<id>/<run>-<stage>.log
//   .sandcastle/logs/planner/<run>-iteration-<n>.log
// <run> is this process's start time, so repeated runs on the same issue sit
// side by side. Paths are absolute so worktree sandboxes write to the main
// checkout's logs folder, not into their worktree.
const LOG_DIR = resolve(import.meta.dirname, "logs");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const logTo = (...parts: string[]): sandcastle.LoggingOption => ({
  type: "file",
  path: resolve(LOG_DIR, ...parts),
});

const MAX_ITERATIONS = 10;

const agent = () => sandcastle.claudeCode("claude-opus-5-5");

// Run inside the sandbox before the agent starts: Postgres (dev + _test DBs,
// see the Dockerfile) for integration tests, then fresh dependencies.
const hooks = {
  sandbox: {
    onSandboxReady: [
      { command: 'pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" -w start' },
      { command: "pnpm install --frozen-lockfile" },
    ],
  },
};

// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full pnpm install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
const copyToWorktree = ["node_modules"];

const planSchema = z.object({
  issues: z.array(z.object({ id: z.coerce.number() })),
});

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/** Pick the candidates that can run in parallel without file conflicts. */
const plan = async (
  candidates: Candidate[],
  iteration: number,
): Promise<Candidate[]> => {
  if (candidates.length <= 1) return candidates;
  // The planner only reads the candidate list: no Postgres, no install.
  const result = await sandcastle.run({
    sandbox: docker(),
    name: "planner",
    logging: logTo("planner", `${RUN_ID}-iteration-${iteration}.log`),
    maxIterations: 1,
    agent: agent(),
    promptFile: "./.sandcastle/plan-prompt.md",
    promptArgs: {
      CANDIDATES: JSON.stringify(
        candidates.map(({ issueNumber, title }) => ({ id: issueNumber, title })),
      ),
    },
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });
  const chosen = new Set(result.output.issues.map((issue) => issue.id));
  const planned = candidates.filter((c) => chosen.has(c.issueNumber));
  // Never stall: an empty or unusable plan falls back to the first candidate.
  return planned.length > 0 ? planned : candidates.slice(0, 1);
};

/** sandbox.run() has no structured output, so stages hand back tagged text. */
const requireTag = (stdout: string, tag: string): string => {
  const content = lastTagContent(stdout, tag);
  if (content === undefined) throw new Error(`Agent output has no <${tag}>`);
  return content;
};

/** Implement (or rebase) one issue in its sandbox and publish the result. */
const implementAndPublish = async (issue: Candidate) => {
  const lease = github.syncBranchWithOrigin(issue.branch);
  const sandbox = await sandcastle.createSandbox({
    branch: issue.branch,
    baseBranch: "origin/main",
    sandbox: docker(),
    hooks,
    copyToWorktree,
  });
  const promptArgs = {
    TASK_ID: String(issue.issueNumber),
    ISSUE_TITLE: issue.title,
    BRANCH: issue.branch,
    REBASE: issue.pullRequestToRebase === undefined ? "no" : "yes",
  };
  const runStage = (name: string, maxIterations: number) =>
    sandbox.run({
      name,
      logging: logTo(`issue-${issue.issueNumber}`, `${RUN_ID}-${name}.log`),
      maxIterations,
      agent: agent(),
      promptFile: `./.sandcastle/${name}-prompt.md`,
      promptArgs,
    });
  const report = (message: string) =>
    console.log(`  ${issue.issueNumber}: ${message}`);

  try {
    await runStage("implement", 100);

    if (issue.pullRequestToRebase !== undefined) {
      if (!github.isOnTopOfMain(issue.branch)) {
        report("rebase onto main did not complete; PR left as it was");
        return;
      }
      github.pushBranch(issue.branch, lease);
      github.commentOnPullRequest(
        issue.pullRequestToRebase,
        "Rebased onto `main` by Sandcastle to resolve the conflict.",
      );
      report(`rebased PR #${issue.pullRequestToRebase}`);
      return;
    }

    if (github.commitsAheadOfMain(issue.branch) === 0) {
      report("no commits, nothing to publish");
      return;
    }

    const review = await runStage("review", 1);
    const draft = await runStage("pr", 1);
    const pr = buildPullRequest(issue.issueNumber, {
      title: requireTag(draft.stdout, "pr-title"),
      body: requireTag(draft.stdout, "pr-body"),
      review: lastTagContent(review.stdout, "review") ?? "",
    });
    github.pushBranch(issue.branch, lease);
    report(github.openPullRequest(issue.branch, pr));
  } finally {
    await sandbox.close();
  }
};

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const attempted = new Set<number>();

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  github.fetchOrigin();
  const candidates = selectCandidates(
    github.listReadyIssues(),
    github.listOpenPullRequests(),
  ).filter((c) => !attempted.has(c.issueNumber));

  if (candidates.length === 0) {
    console.log("No unblocked issues without a pending PR. Exiting.");
    break;
  }

  const issues = await plan(candidates, iteration);
  console.log(`Working ${issues.length} issue(s) in parallel:`);
  for (const issue of issues) {
    attempted.add(issue.issueNumber);
    console.log(`  ${issue.issueNumber}: ${issue.title} → ${issue.branch}`);
  }

  const settled = await Promise.allSettled(issues.map(implementAndPublish));
  settled.forEach((outcome, i) => {
    if (outcome.status === "rejected") {
      console.error(`  ✗ ${issues[i]?.issueNumber} failed: ${outcome.reason}`);
    }
  });
}

console.log("\nAll done. Review and squash-merge the open PRs.");
