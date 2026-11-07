// Host-side I/O for the Sandcastle loop: gh and git, run in the main checkout
// with the developer's own credentials (the sandbox token can only read and
// write issues).

import { execFileSync } from "node:child_process";
import { z } from "zod";
import type { OpenIssue, OpenPullRequest, PullRequest } from "./workflow.ts";

const exec = (command: string, args: readonly string[], input?: string) =>
  execFileSync(command, args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "inherit"],
  }).trim();

const gh = (...args: string[]) => exec("gh", args);
const git = (...args: string[]) => exec("git", args);

const issueListSchema = z.array(z.object({ number: z.number(), title: z.string() }));
const blockerCountSchema = z.coerce.number().int().nonnegative();
const pullRequestListSchema = z.array(
  z.object({
    number: z.number(),
    headRefName: z.string(),
    mergeable: z.enum(["MERGEABLE", "CONFLICTING", "UNKNOWN"]),
  }),
);

/** Open `ready-for-agent` issues with their count of open native blockers. */
export const listReadyIssues = (): OpenIssue[] =>
  issueListSchema
    .parse(
      JSON.parse(
        gh(
          "issue", "list",
          "--state", "open",
          "--label", "ready-for-agent",
          "--limit", "100",
          "--json", "number,title",
        ),
      ),
    )
    .sort((a, b) => a.number - b.number)
    .map((issue) => ({
      ...issue,
      openBlockers: blockerCountSchema.parse(
        gh(
          "api", `repos/{owner}/{repo}/issues/${issue.number}`,
          "--jq", ".issue_dependencies_summary.blocked_by",
        ),
      ),
    }));

const mergeableSchema = z.object({
  mergeable: z.enum(["MERGEABLE", "CONFLICTING", "UNKNOWN"]),
});

const sleepSync = (ms: number) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * GitHub computes mergeability lazily: a PR whose base just moved reports
 * UNKNOWN until something asks for it. Asking per PR starts that computation,
 * so poll until it settles; selection would otherwise treat a conflicting PR
 * as waiting for a merge and never rebase it.
 */
const settleMergeable = (pr: OpenPullRequest): OpenPullRequest => {
  let current = pr;
  for (let attempt = 0; current.mergeable === "UNKNOWN" && attempt < 10; attempt++) {
    sleepSync(3000);
    const { mergeable } = mergeableSchema.parse(
      JSON.parse(gh("pr", "view", String(pr.number), "--json", "mergeable")),
    );
    current = { ...current, mergeable };
  }
  return current;
};

export const listOpenPullRequests = (): OpenPullRequest[] =>
  pullRequestListSchema
    .parse(
      JSON.parse(
        gh(
          "pr", "list",
          "--state", "open",
          "--limit", "100",
          "--json", "number,headRefName,mergeable",
        ),
      ),
    )
    .map(settleMergeable);

export const fetchOrigin = () => {
  git("fetch", "--prune", "origin");
};

const revParse = (ref: string): string | undefined => {
  try {
    return exec("git", ["rev-parse", "--verify", "--quiet", ref]);
  } catch {
    return undefined;
  }
};

/**
 * Point the local branch at origin's copy, so a re-run continues from what's
 * on the PR (including the developer's own pushes), and return that commit as
 * the lease for the later push. A branch that isn't on origin yet keeps its
 * local state; its lease is "must not exist on origin".
 */
export const syncBranchWithOrigin = (branch: string): string => {
  const remote = revParse(`refs/remotes/origin/${branch}`);
  if (remote) git("branch", "--force", branch, remote);
  return remote ?? "";
};

export const commitsAheadOfMain = (branch: string): number =>
  Number(git("rev-list", "--count", `origin/main..${branch}`));

export const isOnTopOfMain = (branch: string): boolean => {
  try {
    git("merge-base", "--is-ancestor", "origin/main", branch);
    return true;
  } catch {
    return false;
  }
};

/**
 * Force-push (a rebase rewrites the branch), but only if origin still has the
 * commit the run started from, so nobody's newer pushes are overwritten.
 */
export const pushBranch = (branch: string, lease: string) => {
  git(
    "push",
    `--force-with-lease=refs/heads/${branch}:${lease}`,
    "--set-upstream",
    "origin",
    branch,
  );
};

export const openPullRequest = (branch: string, pr: PullRequest): string =>
  exec(
    "gh",
    [
      "pr", "create",
      "--base", "main",
      "--head", branch,
      "--title", pr.title,
      "--body-file", "-",
    ],
    pr.body,
  );

export const commentOnPullRequest = (prNumber: number, body: string) => {
  gh("pr", "comment", String(prNumber), "--body", body);
};
