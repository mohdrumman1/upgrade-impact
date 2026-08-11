import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { GitHubApi } from "../src/github-api.ts";

test("updates the one marked pull-request comment without exposing the token", async () => {
  const requests: Array<{ method: string; url: string; authorization: string | undefined; body: string }> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push({
        method: request.method ?? "",
        url: request.url ?? "",
        authorization: request.headers.authorization,
        body,
      });
      response.setHeader("content-type", "application/json");
      if (request.method === "GET") {
        response.end(JSON.stringify([{ id: 42, body: "<!-- upgrade-impact-report -->\nold" }]));
      } else {
        response.end(JSON.stringify({ id: 42, body: "new" }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const api = new GitHubApi("test-secret", `http://127.0.0.1:${address.port}`);
    const result = await api.upsertPullRequestComment(
      "owner/repo",
      7,
      "<!-- upgrade-impact-report -->",
      "new report",
    );
    assert.deepEqual(result, { id: 42, operation: "updated" });
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, "/repos/owner/repo/issues/7/comments?per_page=100&page=1");
    assert.equal(requests[1]?.method, "PATCH");
    assert.equal(requests[1]?.url, "/repos/owner/repo/issues/comments/42");
    assert.equal(requests[1]?.body, JSON.stringify({ body: "new report" }));
    assert.ok(requests.every((request) => request.authorization === "Bearer test-secret"));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
});

test("reports only a sanitized GitHub status and endpoint", async () => {
  const server = createServer((_request, response) => {
    response.statusCode = 403;
    response.end(JSON.stringify({ message: "token test-secret rejected" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const api = new GitHubApi("test-secret", `http://127.0.0.1:${address.port}`);
    await assert.rejects(
      () => api.getPullRequest("owner/repo", 1),
      (error: unknown) => error instanceof Error &&
        /HTTP 403/.test(error.message) &&
        !error.message.includes("test-secret"),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
});
