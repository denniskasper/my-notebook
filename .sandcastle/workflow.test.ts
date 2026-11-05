import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildPullRequest, selectCandidates } from "./workflow.ts";

const ATTRIBUTION = "🤖 Generated with [Claude Code](https://claude.com/claude-code)";

describe("selectCandidates", () => {
  test("an unblocked issue without a PR is a fresh candidate on its own branch", () => {
    const candidates = selectCandidates(
      [{ number: 30, title: "Walking skeleton", openBlockers: 0 }],
      [],
    );

    assert.deepEqual(candidates, [
      {
        issueNumber: 30,
        title: "Walking skeleton",
        branch: "sandcastle/issue-30",
        pullRequestToRebase: undefined,
      },
    ]);
  });

  test("an issue with an open blocker is not a candidate", () => {
    const candidates = selectCandidates(
      [
        { number: 31, title: "Deploy pipeline", openBlockers: 2 },
        { number: 33, title: "Text Sources and source reader", openBlockers: 0 },
      ],
      [],
    );

    assert.deepEqual(
      candidates.map((c) => c.issueNumber),
      [33],
    );
  });

  test("an issue whose PR waits for the developer's merge is not a candidate", () => {
    const candidates = selectCandidates(
      [
        { number: 33, title: "Text Sources and source reader", openBlockers: 0 },
        { number: 41, title: "Demo fixtures", openBlockers: 0 },
      ],
      [{ number: 60, headRefName: "sandcastle/issue-33", mergeable: "MERGEABLE" }],
    );

    assert.deepEqual(
      candidates.map((c) => c.issueNumber),
      [41],
    );
  });

  test("an issue whose PR conflicts with main comes back to be rebased", () => {
    const candidates = selectCandidates(
      [{ number: 48, title: "Spend caps and rate limits", openBlockers: 0 }],
      [{ number: 61, headRefName: "sandcastle/issue-48", mergeable: "CONFLICTING" }],
    );

    assert.deepEqual(candidates, [
      {
        issueNumber: 48,
        title: "Spend caps and rate limits",
        branch: "sandcastle/issue-48",
        pullRequestToRebase: 61,
      },
    ]);
  });
});

describe("buildPullRequest", () => {
  test("the body closes the issue so merging the PR closes it", () => {
    const pr = buildPullRequest(30, {
      title: "feat: add walking skeleton",
      body: "## Summary\n\nAdds the app shell.",
      review: "",
    });

    assert.equal(pr.title, "feat: add walking skeleton");
    assert.equal(pr.body, `## Summary\n\nAdds the app shell.\n\nCloses #30\n\n${ATTRIBUTION}`);
  });

  test("a body that already closes the issue is not given a second closing line", () => {
    const pr = buildPullRequest(30, {
      title: "feat: add walking skeleton",
      body: "Adds the app shell.\n\nCloses #30",
      review: "",
    });

    assert.equal(pr.body, `Adds the app shell.\n\nCloses #30\n\n${ATTRIBUTION}`);
  });

  test("a title that isn't a Conventional Commit is rejected", () => {
    for (const title of ["Add walking skeleton", "feature: add shell", "feat:"]) {
      assert.throws(
        () => buildPullRequest(30, { title, body: "", review: "" }),
        /Conventional Commits/,
        title,
      );
    }
  });

  test("a scoped or breaking-change title is accepted", () => {
    for (const title of ["fix(chat): stop a stalled stream", "refactor(llm)!: split adapters"]) {
      assert.equal(buildPullRequest(30, { title, body: "", review: "" }).title, title);
    }
  });

  test("the code-review summary is part of the body, before the closing line", () => {
    const pr = buildPullRequest(34, {
      title: "feat(chat): stream answers with Citations",
      body: "## Summary\n\nStreams answers.",
      review: "Standards: 1 finding fixed. Spec: all criteria met.",
    });

    assert.equal(
      pr.body,
      `## Summary\n\nStreams answers.\n\n## Code review\n\nStandards: 1 finding fixed. Spec: all criteria met.\n\nCloses #34\n\n${ATTRIBUTION}`,
    );
  });

  test("an attribution line the agent wrote is moved to the very end", () => {
    const pr = buildPullRequest(51, {
      title: "chore: add smoke file",
      body: `## Summary\n\nAdds a file.\n\n${ATTRIBUTION}`,
      review: "No findings.",
    });

    assert.equal(
      pr.body,
      `## Summary\n\nAdds a file.\n\n## Code review\n\nNo findings.\n\nCloses #51\n\n${ATTRIBUTION}`,
    );
  });
});
