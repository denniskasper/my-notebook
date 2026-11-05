// Host-side I/O for the Sandcastle loop: gh and git, run in the main checkout
// with the developer's own credentials (the sandbox token can only read and
// write issues).

import { execFileSync } from "node:child_process";
import type { OpenIssue, OpenPullRequest, PullRequest } from "./workflow.ts";

const run = (command: string, args: readonly string[], input?: string) =>
  execFileSync(command, args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "inherit"],
  }).trim();

const gh = (...args: string[]) => run("gh", args);
const git = (...args: string[]) => run("git", args);

/** Open `ready-for-agent` issues with their count of open native blockers. */
export const listReadyIssues = (): OpenIssue[] => {
  const issues: { number: number; title: string }[] = JSON.parse(
    gh(
      "issue", "list",
      "--state", "open",
      "--label", "ready-for-agent",
      "--limit", "100",
      "--json", "number,title",
    ),
  );
  return issues
    .sort((a, b) => a.number - b.number)
    .map((issue) => ({
      ...issue,
      openBlockers: Number(
        gh(
          "api", `repos/{owner}/{repo}/issues/${issue.number}`,
          "--jq", ".issue_dependencies_summary.blocked_by",
        ),
      ),
    }));
};

export const listOpenPullRequests = (): (OpenPullRequest & {
  number: number;
})[] =>
  JSON.parse(
    gh(
      "pr", "list",
      "--state", "open",
      "--limit", "100",
      "--json", "number,headRefName,mergeable",
    ),
  );

export const fetchOrigin = () => {
  git("fetch", "--prune", "origin");
};

/** Make a branch that only exists on origin (e.g. after a fresh clone) local. */
export const ensureLocalBranch = (branch: string) => {
  const local = git("branch", "--list", branch);
  const remote = git("branch", "--remotes", "--list", `origin/${branch}`);
  if (!local && remote) git("branch", branch, `origin/${branch}`);
};

export const commitsAheadOfMain = (branch: string): number =>
  Number(git("rev-list", "--count", `origin/main..${branch}`));

/** Force-with-lease, because a rebase onto main rewrites the branch. */
export const pushBranch = (branch: string) => {
  git("push", "--force-with-lease", "--set-upstream", "origin", branch);
};

export const openPullRequest = (branch: string, pr: PullRequest): string =>
  run(
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
