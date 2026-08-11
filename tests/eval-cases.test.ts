import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type EvalCase = {
  id: string;
  repository: string;
  pullRequest: number;
  reason: string;
};

test("historical evaluation set has 15 unique, well-formed public PR references", async () => {
  const cases = JSON.parse(
    await readFile(new URL("../evals/cases.json", import.meta.url), "utf8"),
  ) as EvalCase[];

  assert.equal(cases.length, 15);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.equal(
    new Set(cases.map((item) => `${item.repository}#${item.pullRequest}`)).size,
    cases.length,
  );
  for (const item of cases) {
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.match(item.repository, /^[^/]+\/[^/]+$/);
    assert.ok(Number.isSafeInteger(item.pullRequest) && item.pullRequest > 0);
    assert.ok(item.reason.length >= 10);
  }
});
