import assert from "node:assert/strict";
import test from "node:test";
import { verifyAnalysisEvidence } from "../src/analysis-verification.ts";
import type { AnalysisInput } from "../src/analysis-input.ts";
import type { AnalysisResult } from "../src/analysis-schema.ts";

const input: AnalysisInput = {
  repository: "acme/app",
  pullRequest: 1,
  baseSha: "a".repeat(40),
  dependencies: [
    {
      dependency: {
        name: "pkg",
        section: "dependencies",
        before: "1.0.0",
        after: "2.0.0",
        kind: "upgraded",
        versionDelta: "major",
      },
      repositoryEvidence: [
        { path: "src/app.ts", startLine: 10, endLine: 14, content: "10: import pkg" },
      ],
      officialEvidence: [
        {
          source: "github-release",
          version: "2.0.0",
          tag: "v2.0.0",
          url: "https://github.com/acme/pkg/releases/tag/v2.0.0",
          content: "breaking change",
        },
      ],
      evidenceGap: null,
    },
  ],
};

test("accepts repository lines and official URLs present in the prepared input", () => {
  const verification = verifyAnalysisEvidence(result("src/app.ts:11-13"), input);
  assert.deepEqual(verification, { valid: true, errors: [] });
});

test("rejects invented paths, out-of-range lines, and unprepared URLs", () => {
  const analysis = result("src/app.ts:20");
  analysis.findings[0]!.repositoryEvidence.push("src/missing.ts:1");
  analysis.findings[0]!.releaseEvidence.push("https://example.com/invented");
  const verification = verifyAnalysisEvidence(analysis, input);
  assert.equal(verification.valid, false);
  assert.equal(verification.errors.length, 3);
});

test("accepts a safe omission report when no finding cites evidence", () => {
  const analysis: AnalysisResult = {
    risk: "unknown",
    confidence: 0.3,
    summary: "Evidence is insufficient.",
    findings: [],
    omittedConcerns: ["No official evidence was prepared."],
  };
  assert.deepEqual(verifyAnalysisEvidence(analysis, input), { valid: true, errors: [] });
});

function result(reference: string): AnalysisResult {
  return {
    risk: "medium",
    confidence: 0.8,
    summary: "A supported finding.",
    findings: [
      {
        title: "Check the upgrade",
        impact: "The repository imports the affected package.",
        repositoryEvidence: [reference],
        releaseEvidence: ["https://github.com/acme/pkg/releases/tag/v2.0.0"],
        recommendedChecks: ["Run the existing test suite."],
      },
    ],
    omittedConcerns: [],
  };
}
