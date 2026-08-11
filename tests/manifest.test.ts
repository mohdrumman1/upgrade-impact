import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compareManifests,
  extractNumericVersion,
  parseManifest,
} from "../src/manifest.ts";

test("compares dependency sections and sorts results", async () => {
  const [beforeText, afterText] = await Promise.all([
    readFile(new URL("fixtures/package-before.json", import.meta.url), "utf8"),
    readFile(new URL("fixtures/package-after.json", import.meta.url), "utf8"),
  ]);

  const changes = compareManifests(parseManifest(beforeText), parseManifest(afterText));

  assert.deepEqual(changes, [
    {
      name: "@scope/core",
      section: "dependencies",
      before: "^1.2.3",
      after: "^2.0.0",
      kind: "upgraded",
      versionDelta: "major",
    },
    {
      name: "added-package",
      section: "dependencies",
      before: null,
      after: "1.0.0",
      kind: "added",
      versionDelta: "unknown",
    },
    {
      name: "react",
      section: "dependencies",
      before: "^18.3.1",
      after: "~18.3.1",
      kind: "range-changed",
      versionDelta: "same",
    },
    {
      name: "removed-package",
      section: "dependencies",
      before: "2.0.0",
      after: null,
      kind: "removed",
      versionDelta: "unknown",
    },
    {
      name: "typescript",
      section: "devDependencies",
      before: "~5.8.2",
      after: "~5.9.0",
      kind: "upgraded",
      versionDelta: "minor",
    },
    {
      name: "vitest",
      section: "devDependencies",
      before: "3.2.0",
      after: "3.1.0",
      kind: "downgraded",
      versionDelta: "minor",
    },
  ]);
});

test("detects changes for non-registry dependency specifications", () => {
  const changes = compareManifests(
    { dependencies: { local: "workspace:*", source: "git+https://example.test/a.git" } },
    { dependencies: { local: "workspace:^", source: "git+https://example.test/b.git" } },
  );

  assert.deepEqual(
    changes.map(({ name, kind, versionDelta }) => ({ name, kind, versionDelta })),
    [
      { name: "local", kind: "changed", versionDelta: "unknown" },
      { name: "source", kind: "changed", versionDelta: "unknown" },
    ],
  );
});

test("extracts common registry version specifications", () => {
  assert.deepEqual(extractNumericVersion("^1.2.3"), [1, 2, 3]);
  assert.deepEqual(extractNumericVersion(">=20.0.0"), [20, 0, 0]);
  assert.deepEqual(extractNumericVersion("npm:alias@2.4.6"), [2, 4, 6]);
  assert.equal(extractNumericVersion("workspace:*"), null);
  assert.equal(extractNumericVersion("latest"), null);
});

test("rejects malformed manifests", () => {
  assert.throws(() => parseManifest("[1,2,3]"), /expected a JSON object/);
  assert.throws(() => parseManifest("{"), /Invalid package manifest JSON/);
  assert.throws(
    () => parseManifest('{"dependencies":{"react":18}}'),
    /dependencies must map package names to string versions/,
  );
});

test("ignores unchanged manifests", () => {
  const manifest = { dependencies: { react: "^18.3.1" } };
  assert.deepEqual(compareManifests(manifest, manifest), []);
});
