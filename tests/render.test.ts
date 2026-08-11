import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "../src/render.ts";

test("renders an empty result", () => {
  assert.equal(
    renderMarkdown([]),
    "## UpgradeImpact\n\nNo dependency manifest changes detected.\n",
  );
});

test("renders and escapes dependency changes", () => {
  const output = renderMarkdown([
    {
      name: "package|name",
      section: "dependencies",
      before: "^1.0.0",
      after: "^2.0.0",
      kind: "upgraded",
      versionDelta: "major",
    },
  ]);

  assert.match(output, /1 dependency change detected/);
  assert.match(output, /package\\\|name/);
  assert.match(output, /`\^1\.0\.0`/);
  assert.match(output, /upgraded \| major/);
  assert.match(output, /does not yet include release-note/);
});
