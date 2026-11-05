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
  issues: z.array(z.object({ id: z.string() })),
});

const pullRequestSchema = z.object({
  title: z.string(),
  body: z.string(),
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
        candidates.map(({ id, title }) => ({ id, title })),
      ),
    },
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });
  const chosen = new Set(result.output.issues.map((issue) => issue.id));
  const planned = candidates.filter((c) => chosen.has(c.id));
  // Never stall: an empty or unusable plan falls back to the first candidate.
  return planned.length > 0 ? planned : candidates.slice(0, 1);
};

/** Implement (or rebase) one issue in its sandbox and publish the result. */
const work = async (issue: Candidate, openPrNumber: number | undefined) => {
  github.ensureLocalBranch(issue.branch);
  const sandbox = await sandcastle.createSandbox({
    branch: issue.branch,
    baseBranch: "origin/main",
    sandbox: docker(),
    hooks,
    copyToWorktree,
  });
  const log = (stage: string) => logTo(`issue-${issue.id}`, `${RUN_ID}-${stage}.log`);

  try {
    await sandbox.run({
      name: "implementer",
      logging: log("implementer"),
      maxIterations: 100,
      agent: agent(),
      promptFile: "./.sandcastle/implement-prompt.md",
      promptArgs: {
        TASK_ID: issue.id,
        ISSUE_TITLE: issue.title,
        BRANCH: issue.branch,
        REBASE: issue.rebase ? "yes" : "no",
      },
    });

    if (github.commitsAheadOfMain(issue.branch) === 0) {
      console.log(`  ${issue.id}: no commits, nothing to publish`);
      return;
    }

    if (issue.rebase && openPrNumber !== undefined) {
      github.pushBranch(issue.branch);
      github.commentOnPullRequest(
        openPrNumber,
        "Rebased onto `main` by Sandcastle to resolve the conflict.",
      );
      console.log(`  ${issue.id}: rebased PR #${openPrNumber}`);
      return;
    }

    const review = await sandbox.run({
      name: "reviewer",
      logging: log("reviewer"),
      maxIterations: 1,
      agent: agent(),
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs: { TASK_ID: issue.id, BRANCH: issue.branch },
    });

    const draft = await sandbox.run({
      name: "pr-writer",
      logging: log("pr-writer"),
      maxIterations: 1,
      agent: agent(),
      promptFile: "./.sandcastle/pr-prompt.md",
      promptArgs: { TASK_ID: issue.id, BRANCH: issue.branch },
    });

    // sandbox.run() has no structured output, so read the tags ourselves.
    const pr = buildPullRequest(Number(issue.id), {
      ...pullRequestSchema.parse(
        JSON.parse(
          (lastTagContent(draft.stdout, "pr") ?? "null").replace(
            /^```(?:json)?\s*|\s*```$/g,
            "",
          ),
        ),
      ),
      review: lastTagContent(review.stdout, "review") ?? "",
    });
    github.pushBranch(issue.branch);
    console.log(`  ${issue.id}: ${github.openPullRequest(issue.branch, pr)}`);
  } finally {
    await sandbox.close();
  }
};

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const attempted = new Set<string>();

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  github.fetchOrigin();
  const openPullRequests = github.listOpenPullRequests();
  const candidates = selectCandidates(
    github.listReadyIssues(),
    openPullRequests,
  ).filter((c) => !attempted.has(c.id));

  if (candidates.length === 0) {
    console.log("No unblocked issues without a pending PR. Exiting.");
    break;
  }

  const issues = await plan(candidates, iteration);
  console.log(`Working ${issues.length} issue(s) in parallel:`);
  for (const issue of issues) {
    attempted.add(issue.id);
    console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
  }

  const settled = await Promise.allSettled(
    issues.map((issue) =>
      work(
        issue,
        openPullRequests.find((pr) => pr.headRefName === issue.branch)?.number,
      ),
    ),
  );
  settled.forEach((outcome, i) => {
    if (outcome.status === "rejected") {
      console.error(`  ✗ ${issues[i]?.id} failed: ${outcome.reason}`);
    }
  });
}

console.log("\nAll done. Review and squash-merge the open PRs.");
