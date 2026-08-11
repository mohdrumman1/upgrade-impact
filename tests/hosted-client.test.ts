import assert from "node:assert/strict";
import test from "node:test";
import { requestHostedAnalysis } from "../src/hosted-client.ts";

const graph = { version: 2 as const, repository: "owner/repo", pullRequest: 1, baseSha: "a".repeat(40), dependencies: [] };
const input = { ...graph, dependencies: [] };

test("sends the bounded contract and verifies the hosted response", async () => {
  let authorization = "";
  const result = await requestHostedAnalysis({
    endpoint: "https://beta.example.test/base/",
    token: "t".repeat(32),
    requestId: "run-1",
    analysisInput: input,
    graph,
    fetch: async (request, init) => {
      assert.equal(String(request), "https://beta.example.test/base/v1/analyse");
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({
        version: 1,
        analysis: { risk: "unknown", confidence: 1, summary: "No applicable impact.", findings: [], omittedConcerns: [] },
        metadata: { provider: "openrouter-openai-mini", model: "openai/gpt-5.4-mini", requestHash: "hash", spendUsd: 0.001, attempts: 1, usage: [], latencyMs: 5 },
      });
    },
  });
  assert.equal(authorization, `Bearer ${"t".repeat(32)}`);
  assert.equal(result.analysis.risk, "unknown");
});

test("rejects insecure remote endpoints and sanitizes server errors", async () => {
  await assert.rejects(requestHostedAnalysis({ endpoint: "http://example.test", token: "t".repeat(32), requestId: "run-1", analysisInput: input, graph }), /must use HTTPS/);
  await assert.rejects(
    requestHostedAnalysis({ endpoint: "https://example.test", token: "t".repeat(32), requestId: "run-1", analysisInput: input, graph, fetch: async () => new Response("secret details", { status: 502 }) }),
    (error: unknown) => error instanceof Error && error.message === "Hosted analysis failed with HTTP 502",
  );
});
