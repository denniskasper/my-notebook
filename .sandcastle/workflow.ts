// Pure decisions of the Sandcastle loop: which issues to work on and what PR
// to open for them. main.ts does the I/O (gh, git) around these.

export interface OpenIssue {
  readonly number: number;
  readonly title: string;
  /** Open issues blocking this one (GitHub native dependencies). */
  readonly openBlockers: number;
}

export interface Candidate {
  readonly issueNumber: number;
  readonly title: string;
  readonly branch: string;
  /** The branch's open PR, set when it conflicts with main and needs a rebase. */
  readonly pullRequestToRebase: number | undefined;
}

export interface OpenPullRequest {
  readonly number: number;
  readonly headRefName: string;
  /** GitHub's mergeability; UNKNOWN while GitHub is still computing it. */
  readonly mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
}

export const branchFor = (issueNumber: number): string =>
  `sandcastle/issue-${issueNumber}`;

export const selectCandidates = (
  issues: readonly OpenIssue[],
  openPullRequests: readonly OpenPullRequest[],
): Candidate[] => {
  const pullRequestByBranch = new Map(
    openPullRequests.map((pr) => [pr.headRefName, pr]),
  );
  return issues
    .filter((issue) => issue.openBlockers === 0)
    .flatMap((issue) => {
      const branch = branchFor(issue.number);
      const pullRequest = pullRequestByBranch.get(branch);
      // A PR that isn't conflicting is waiting for the developer's merge.
      if (pullRequest && pullRequest.mergeable !== "CONFLICTING") return [];
      return [
        {
          issueNumber: issue.number,
          title: issue.title,
          branch,
          pullRequestToRebase: pullRequest?.number,
        },
      ];
    });
};

/** What the PR-writing agent hands back. */
export interface PullRequestDraft {
  readonly title: string;
  readonly body: string;
  /** Summary of the code-review findings and fixes; may be empty. */
  readonly review: string;
}

export interface PullRequest {
  readonly title: string;
  readonly body: string;
}

// The PR title becomes the squash commit, so it must pass the PR-title check.
const CONVENTIONAL_TITLE =
  /^(feat|fix|docs|refactor|test|chore|perf|build|ci|style|revert)(\([a-z0-9-]+\))?!?: \S.*$/;

export const ATTRIBUTION =
  "🤖 Generated with [Claude Code](https://claude.com/claude-code)";

export const buildPullRequest = (
  issueNumber: number,
  draft: PullRequestDraft,
): PullRequest => {
  if (!CONVENTIONAL_TITLE.test(draft.title)) {
    throw new Error(
      `PR title is not a Conventional Commits subject: "${draft.title}"`,
    );
  }
  const closesIssue = new RegExp(
    `\\b(close[sd]?|fix(e[sd])?|resolve[sd]?) #${issueNumber}\\b`,
    "i",
  ).test(draft.body);
  const review = draft.review.trim();
  const sections = [
    draft.body.replace(ATTRIBUTION, "").trim(),
    review && `## Code review\n\n${review}`,
    closesIssue ? "" : `Closes #${issueNumber}`,
    ATTRIBUTION,
  ];
  return { title: draft.title, body: sections.filter(Boolean).join("\n\n") };
};

/** The agent's last `<tag>…</tag>` block, as Sandcastle's structured output reads it. */
export const lastTagContent = (stdout: string, tag: string): string | undefined => {
  const close = stdout.lastIndexOf(`</${tag}>`);
  const open = stdout.lastIndexOf(`<${tag}>`, close);
  if (close === -1 || open === -1) return undefined;
  return stdout.slice(open + tag.length + 2, close).trim();
};
