import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExcerpt,
  isRelevantPackageReference,
  isSafeRepositoryPath,
  isSensitiveRepositoryPath,
  parseGitGrep,
  packageReferenceTerms,
  redactLikelySecrets,
  selectBoundedMatches,
} from "../src/evidence.ts";

test("parses git grep output and ignores malformed or unsafe rows", () => {
  const output = [
    "abc123:src/app.ts:4:import next from 'next'",
    "abc123:../secret.ts:2:next",
    "not a match",
  ].join("\n");
  assert.deepEqual(parseGitGrep(output), [
    { path: "src/app.ts", line: 4, matchedLine: "import next from 'next'" },
  ]);
});

test("adds bounded npm executable aliases to package reference terms", () => {
  assert.deepEqual(packageReferenceTerms("@biomejs/biome", { biome: "bin/biome" }), [
    "@biomejs/biome",
    "biome",
  ]);
  assert.deepEqual(packageReferenceTerms("@scope/tool", "cli.js"), [
    "@scope/tool",
    "tool",
  ]);
  assert.deepEqual(
    packageReferenceTerms("pkg", { pkg: "cli.js", "../unsafe": "bad", extra: "x" }),
    ["pkg", "extra"],
  );
});

test("prioritises production code and returns unique bounded matches", () => {
  const selected = selectBoundedMatches(
    [
      { path: "package.json", line: 2, matchedLine: "next" },
      { path: "tests/app.test.ts", line: 3, matchedLine: "next" },
      { path: "src/app.ts", line: 5, matchedLine: "next again" },
      { path: "src/app.ts", line: 4, matchedLine: "next" },
      { path: "next.config.js", line: 1, matchedLine: "next" },
    ],
    3,
  );
  assert.deepEqual(
    selected.map((match) => match.path),
    ["src/app.ts", "next.config.js", "tests/app.test.ts"],
  );
});

test("filters substring noise while retaining imports, config, and commands", () => {
  assert.equal(
    isRelevantPackageReference(
      { path: ".gitignore", line: 1, matchedLine: ".next" },
      "next",
    ),
    false,
  );
  assert.equal(
    isRelevantPackageReference(
      { path: "package-lock.json", line: 1, matchedLine: '"next": "15.0.0"' },
      "next",
    ),
    false,
  );
  assert.equal(
    isRelevantPackageReference(
      { path: "pages/app.tsx", line: 1, matchedLine: "import Link from 'next/link'" },
      "next",
    ),
    true,
  );
  assert.equal(
    isRelevantPackageReference(
      { path: "package.json", line: 4, matchedLine: "\"lint\": \"next lint\"" },
      "next",
    ),
    true,
  );
});

test("builds line-numbered, bounded excerpts", () => {
  const excerpt = buildExcerpt("one\ntwo\nthree\nfour\nfive\nsix", {
    path: "src/app.ts",
    line: 4,
    matchedLine: "four",
  });
  assert.deepEqual(excerpt, {
    path: "src/app.ts",
    startLine: 2,
    endLine: 6,
    content: "2: two\n3: three\n4: four\n5: five\n6: six",
  });
});

test("excludes sensitive paths and redacts likely credentials", () => {
  assert.equal(isSensitiveRepositoryPath(".env.production"), true);
  assert.equal(isSensitiveRepositoryPath("config/credentials.json"), true);
  assert.equal(isSensitiveRepositoryPath("src/client.ts"), false);
  assert.equal(
    isRelevantPackageReference(
      { path: ".env.production", line: 1, matchedLine: "FRAMEWORK=next" },
      "next",
    ),
    false,
  );
  assert.equal(
    redactLikelySecrets(
      "token: ghp_abcdefghijklmnopqrstuvwxyz\nAuthorization=Bearer abcdefghijklmnop",
    ),
    "token: [REDACTED]\nAuthorization=Bearer [REDACTED]",
  );
});

test("validates repository-relative paths", () => {
  assert.equal(isSafeRepositoryPath("src/app.ts"), true);
  assert.equal(isSafeRepositoryPath("../app.ts"), false);
  assert.equal(isSafeRepositoryPath("/etc/passwd"), false);
  assert.equal(isSafeRepositoryPath("bad\npath"), false);
});
