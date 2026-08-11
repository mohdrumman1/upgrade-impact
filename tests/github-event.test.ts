import assert from "node:assert/strict";
import test from "node:test";
import {
  analysisRunId,
  parsePullRequestEvent,
  renderComment,
  UPGRADE_IMPACT_COMMENT_MARKER,
} from "../src/github-event.ts";

const sha = "a".repeat(40);
const headSha = "b".repeat(40);

function event(overrides: Record<string, unknown> = {}) {
  return {
    action: "synchronize",
    repository: { full_name: "owner/repo", private: false },
    pull_request: {
      number: 12,
      base: { sha, repo: { full_name: "owner/repo", private: false } },
      head: { sha: headSha, repo: { full_name: "fork/repo", private: false } },
    },
    ...overrides,
  };
}

test("accepts a bounded public pull request event", () => {
  const parsed = parsePullRequestEvent(event());
  assert.equal(parsed.repository.full_name, "owner/repo");
  assert.equal(parsed.pull_request.number, 12);
});

test("rejects private repositories, unsafe identifiers, and unsupported actions", () => {
  assert.throws(
    () => parsePullRequestEvent(event({ repository: { full_name: "owner/repo", private: true } })),
    /Private repositories/,
  );
  assert.throws(
    () => parsePullRequestEvent(event({ repository: { full_name: "bad repo", private: false } })),
    /Unsafe repository/,
  );
  assert.throws(() => parsePullRequestEvent(event({ action: "closed" })), /Unsupported/);
});

test("creates a stable collision-resistant run id", () => {
  assert.equal(
    analysisRunId("owner/repo", 12, sha, headSha),
    analysisRunId("owner/repo", 12, sha, headSha),
  );
  assert.notEqual(
    analysisRunId("owner/repo", 12, sha, headSha),
    analysisRunId("owner/repo", 13, sha, headSha),
  );
  assert.notEqual(
    analysisRunId("owner/repo", 12, sha, headSha),
    analysisRunId("owner/repo", 12, "c".repeat(40), headSha),
  );
});

test("renders one identifiable, revision-specific comment", () => {
  const comment = renderComment("## Report\n\nSafe.", { headSha, spendUsd: 0.002486 });
  assert.ok(comment.startsWith(UPGRADE_IMPACT_COMMENT_MARKER));
  assert.match(comment, /bbbbbbbbbbbb/);
  assert.match(comment, /US\$0\.0025/);
});
