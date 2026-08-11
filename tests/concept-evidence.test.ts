import assert from "node:assert/strict";
import test from "node:test";
import {
  applicabilitySearchTargets,
  isRelevantConceptReference,
} from "../src/concept-evidence.ts";
import type { ReleaseFactNode } from "../src/applicability.ts";

test("selects bounded actionable facts and excludes generic release-note vocabulary", () => {
  const targets = applicabilitySearchTargets([
    fact("one", "api-symbol", "TypeScript", "changed"),
    fact("two", "api-symbol", "agents#McpAgent", "compatible"),
    fact("three", "cli-flag", "--max-processes", "breaking"),
    fact("four", "config-key", "log_level", "unknown"),
  ]);
  assert.deepEqual(
    targets.map((target) => [target.kind, target.concept, target.term]),
    [
      ["cli-flag", "--max-processes", "--max-processes"],
      ["api-symbol", "agents#McpAgent", "McpAgent"],
    ],
  );
});

test("accepts exact concept references while filtering lockfiles and runtime noise", () => {
  const flag = applicabilitySearchTargets([
    fact("one", "cli-flag", "--max-processes", "breaking"),
  ])[0]!;
  assert.equal(
    isRelevantConceptReference(
      { path: "package.json", line: 4, matchedLine: '"dev": "concurrently --max-processes 2"' },
      flag,
    ),
    true,
  );
  assert.equal(
    isRelevantConceptReference(
      { path: "README.md", line: 4, matchedLine: "Use --max-processes" },
      flag,
    ),
    false,
  );
  const runtime = applicabilitySearchTargets([fact("two", "runtime", "node", "breaking")])[0]!;
  assert.equal(
    isRelevantConceptReference(
      { path: ".github/workflows-disabled/ci.yml", line: 7, matchedLine: "node-version: 14" },
      runtime,
    ),
    false,
  );
  assert.equal(
    isRelevantConceptReference(
      { path: "package.json", line: 7, matchedLine: '"node": ">=18"' },
      runtime,
    ),
    true,
  );
  assert.equal(
    isRelevantConceptReference(
      { path: "src/node.ts", line: 7, matchedLine: "const node = tree.root" },
      runtime,
    ),
    false,
  );
});

function fact(
  id: string,
  kind: ReleaseFactNode["kind"],
  concept: string,
  relationship: ReleaseFactNode["relationship"],
): ReleaseFactNode {
  return {
    id,
    dependency: "example",
    kind,
    concept,
    relationship,
    statement: "example statement",
    releaseUrl: "https://example.test/release",
  };
}
