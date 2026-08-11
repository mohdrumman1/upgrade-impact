import assert from "node:assert/strict";
import test from "node:test";
import { parseAnalysisResult } from "../src/analysis-schema.ts";

const validResult = {
  risk: "medium",
  confidence: 0.88,
  summary: "The changed API is used by one route.",
  findings: [
    {
      title: "Async API migration",
      impact: "The route must await the upgraded API.",
      repositoryEvidence: ["src/route.ts:12"],
      releaseEvidence: ["https://example.test/releases/2"],
      recommendedChecks: ["Run the route integration test"],
    },
  ],
  omittedConcerns: ["Caching change is not relevant because no matching route was found"],
};

test("parses a bounded, evidence-linked analysis", () => {
  assert.deepEqual(parseAnalysisResult(JSON.stringify(validResult)), validResult);
  assert.deepEqual(
    parseAnalysisResult(`\`\`\`json\n${JSON.stringify(validResult)}\n\`\`\``),
    validResult,
  );
  assert.throws(
    () => parseAnalysisResult(`commentary\n${JSON.stringify(validResult)}`),
    /Invalid analysis JSON/,
  );
});

test("rejects unsupported risk and confidence", () => {
  assert.throws(
    () => parseAnalysisResult(JSON.stringify({ ...validResult, risk: "critical" })),
    /unsupported risk/,
  );
  assert.throws(
    () => parseAnalysisResult(JSON.stringify({ ...validResult, confidence: 2 })),
    /confidence must be between 0 and 1/,
  );
});

test("rejects findings without both evidence types", () => {
  const findings = [{ ...validResult.findings[0], repositoryEvidence: [] }];
  assert.throws(
    () => parseAnalysisResult(JSON.stringify({ ...validResult, findings })),
    /both evidence lists are required/,
  );
});

test("rejects non-URL release evidence and oversized arrays", () => {
  const invalidUrl = [
    { ...validResult.findings[0], releaseEvidence: ["not a URL"] },
  ];
  assert.throws(
    () => parseAnalysisResult(JSON.stringify({ ...validResult, findings: invalidUrl })),
    /release evidence must be HTTP URLs/,
  );
  assert.throws(
    () =>
      parseAnalysisResult(
        JSON.stringify({ ...validResult, omittedConcerns: Array(9).fill("item") }),
      ),
    /at most 8 items/,
  );
});
