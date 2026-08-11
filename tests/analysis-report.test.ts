import assert from "node:assert/strict";
import test from "node:test";
import { renderAnalysisMarkdown } from "../src/analysis-report.ts";
import type { AnalysisResult } from "../src/analysis-schema.ts";

const analysis: AnalysisResult = {
  risk: "medium",
  confidence: 0.91,
  summary: "One supported check.",
  findings: [{
    title: "Node floor changed",
    impact: "The declared engine is too low.",
    repositoryEvidence: ["package.json lines 1-4"],
    releaseEvidence: ["https://example.test/release"],
    recommendedChecks: ["Raise the engine floor."],
  }],
  omittedConcerns: [],
};

test("renders verified analysis and deterministic preflight findings", () => {
  const report = renderAnalysisMarkdown(analysis, [{
    kind: "removed-dependency-still-referenced",
    dependency: "tool",
    severity: "high",
    summary: "tool is removed but invoked.",
    repositoryEvidence: [{ path: "package.json", startLine: 2, endLine: 3, content: "script" }],
    recommendedChecks: ["Restore or replace tool."],
  }]);
  assert.match(report, /Risk:\*\* medium/);
  assert.match(report, /tool is removed but still referenced/);
  assert.match(report, /Node floor changed/);
  assert.match(report, /https:\/\/example\.test\/release/);
});

test("renders an explicit safe omission", () => {
  const report = renderAnalysisMarkdown({ ...analysis, findings: [] });
  assert.match(report, /No evidence-backed repository-specific impact was found/);
});
