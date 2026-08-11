import assert from "node:assert/strict";
import test from "node:test";
import { parseAnalysisResult } from "../src/analysis-schema.ts";
import type { ApplicabilityGraph } from "../src/applicability.ts";
import { buildDeterministicAnalysis } from "../src/deterministic-analysis.ts";

test("renders a schema-valid minimum-version finding", () => {
  const result = buildDeterministicAnalysis(graph("below-minimum"));
  assert.equal(result.risk, "high");
  assert.match(result.findings[0]!.impact, /20\.0\.0.*18\.0\.0/);
  assert.deepEqual(parseAnalysisResult(JSON.stringify(result)), result);
});

test("renders a safe omission when the graph has no edges", () => {
  const value = graph("below-minimum");
  value.dependencies[0]!.edges = [];
  const result = buildDeterministicAnalysis(value);
  assert.equal(result.risk, "unknown");
  assert.deepEqual(result.findings, []);
  assert.equal(result.omittedConcerns.length, 1);
});

function graph(rule: "below-minimum" | "satisfies-minimum"): ApplicabilityGraph {
  return {
    version: 2,
    repository: "acme/app",
    pullRequest: 42,
    baseSha: "a".repeat(40),
    dependencies: [{
      dependency: {
        name: "rimraf",
        section: "devDependencies",
        before: "5.0.0",
        after: "6.0.0",
        kind: "upgraded",
        versionDelta: "major",
      },
      releaseFacts: [{
        id: "fact",
        dependency: "rimraf",
        kind: "version-constraint",
        concept: "node",
        relationship: "breaking",
        minimumVersion: "20.0.0",
        statement: "Drop support for nodes before v20",
        releaseUrl: "https://example.test/rimraf/6",
      }],
      repositoryUsages: [{
        id: "usage",
        dependency: "rimraf",
        kind: "version-constraint",
        concept: "node",
        repositoryVersion: "18.0.0",
        path: "package.json",
        startLine: 4,
        endLine: 8,
        content: '"node": ">=18"',
      }],
      edges: [{
        id: "edge",
        dependency: "rimraf",
        kind: "version-constraint",
        concept: "node",
        releaseFactId: "fact",
        repositoryUsageId: "usage",
        rule,
      }],
      unmatchedReleaseFactIds: [],
    }],
  };
}
