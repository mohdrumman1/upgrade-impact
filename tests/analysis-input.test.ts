import assert from "node:assert/strict";
import test from "node:test";
import { estimateTokens, renderAnalysisPrompt, type AnalysisInput } from "../src/analysis-input.ts";

test("renders a stable-prefix prompt with bounded dynamic JSON last", () => {
  const input: AnalysisInput = {
    repository: "acme/app",
    pullRequest: 42,
    baseSha: "a".repeat(40),
    dependencies: [],
  };
  const rendered = renderAnalysisPrompt("stable rules\n", input);
  assert.ok(rendered.startsWith("stable rules\n\n<upgrade-impact-input>"));
  assert.ok(rendered.endsWith("</upgrade-impact-input>\n"));
  assert.match(rendered, /"repository": "acme\/app"/);
});

test("uses a conservative transparent character token estimate", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("1234"), 1);
  assert.equal(estimateTokens("12345"), 2);
});
