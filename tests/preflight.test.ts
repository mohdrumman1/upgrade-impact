import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisInput } from "../src/analysis-input.ts";
import { buildPreflightFindings } from "../src/preflight.ts";

test("reports a removed dependency that is still invoked by a script", () => {
  const findings = buildPreflightFindings(input([
    {
      path: "package.json",
      startLine: 5,
      endLine: 9,
      content: '5: "scripts": {\n7:   "build": "ncc build src/main.ts"\n9: }',
    },
  ]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.dependency, "@vercel/ncc");
  assert.equal(findings[0]!.severity, "high");
});

test("does not treat the old manifest declaration as operational usage", () => {
  const findings = buildPreflightFindings(input([
    {
      path: "package.json",
      startLine: 20,
      endLine: 24,
      content: '22: "@vercel/ncc": "^0.38.4"',
    },
  ]));
  assert.deepEqual(findings, []);
});

function input(repositoryEvidence: AnalysisInput["dependencies"][number]["repositoryEvidence"]): AnalysisInput {
  return {
    repository: "acme/action",
    pullRequest: 42,
    baseSha: "a".repeat(40),
    dependencies: [{
      dependency: {
        name: "@vercel/ncc",
        section: "devDependencies",
        before: "^0.38.4",
        after: null,
        kind: "removed",
        versionDelta: "unknown",
      },
      repositoryEvidence,
      officialEvidence: [],
      evidenceGap: null,
    }],
  };
}
