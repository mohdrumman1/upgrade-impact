import assert from "node:assert/strict";
import test from "node:test";
import {
  changelogCandidatePaths,
  extractChangelogExcerpt,
  extractOfficialDocumentation,
  officialUpgradeDocumentationUrl,
  parseGitHubRepository,
  parseRepositoryDirectory,
  releaseTagMatchesPackage,
  selectReleaseExcerpts,
  type GitHubRelease,
} from "../src/release-evidence.ts";

test("selects and bounds an allowlisted versioned official upgrade guide", () => {
  const url = officialUpgradeDocumentationUrl("next", "^14.2.8", "^15.5.18");
  assert.equal(url, "https://nextjs.org/docs/15/app/guides/upgrading/version-15.md");
  assert.deepEqual(
    extractOfficialDocumentation(
      "---\ntitle: Upgrade\n---\n# Upgrade Next.js 15\n\nBreaking details",
      url!,
      28,
    ),
    {
      version: "15.0.0",
      url: "https://nextjs.org/docs/15/app/guides/upgrading/version-15",
      content: "# Upgrade Next.js 15\n\nBreaki",
    },
  );
  assert.equal(officialUpgradeDocumentationUrl("next", "^14.0.0", "^16.0.0"), null);
  assert.equal(
    extractOfficialDocumentation("content", "https://example.com/docs/15/app/guides/upgrading/version-15.md"),
    null,
  );
});

test("normalises supported npm GitHub repository metadata", () => {
  assert.equal(parseGitHubRepository("git+https://github.com/acme/pkg.git"), "acme/pkg");
  assert.equal(parseGitHubRepository({ url: "git@github.com:acme/pkg.git" }), "acme/pkg");
  assert.equal(parseGitHubRepository("github:acme/pkg"), "acme/pkg");
  assert.equal(parseGitHubRepository("https://gitlab.com/acme/pkg"), null);
  assert.equal(parseGitHubRepository({ directory: "packages/pkg" }), null);
});

test("normalises repository directories and builds a small path allowlist", () => {
  assert.equal(parseRepositoryDirectory({ directory: "./packages/pkg/" }), "packages/pkg");
  assert.equal(parseRepositoryDirectory({ directory: "../private" }), null);
  assert.equal(parseRepositoryDirectory({ directory: "/absolute" }), null);
  assert.deepEqual(changelogCandidatePaths("packages/pkg"), [
    "packages/pkg/CHANGELOG.md",
    "packages/pkg/RELEASES.md",
    "CHANGELOG.md",
    "RELEASES.md",
  ]);
});

test("extracts an exact bounded changelog section with an immutable URL", () => {
  const excerpt = extractChangelogExcerpt(
    "# Changelog\n\n## v2.1.0\n\n- Changed behavior\n- More detail\n\n## 2.0.0\n\n- Old\n",
    "2.1.0",
    "packages/pkg/CHANGELOG.md",
    "acme/pkg",
    "a".repeat(40),
    35,
  );
  assert.deepEqual(excerpt, {
    version: "2.1.0",
    path: "packages/pkg/CHANGELOG.md",
    url: `https://github.com/acme/pkg/blob/${"a".repeat(40)}/packages/pkg/CHANGELOG.md`,
    content: "## v2.1.0\n\n- Changed behavior\n- Mor",
  });
});

test("falls back to a major-minor heading and rejects unsafe evidence", () => {
  const text = "# 6.0\n\n- Drop old Node versions\n\n# 5.0\n\n- Older\n";
  assert.match(
    extractChangelogExcerpt(text, "6.0.1", "CHANGELOG.md", "isaacs/rimraf", "b".repeat(40))!
      .content,
    /Drop old Node/,
  );
  assert.equal(
    extractChangelogExcerpt(text, "6.0.1", "../CHANGELOG.md", "isaacs/rimraf", "b".repeat(40)),
    null,
  );
  assert.equal(
    extractChangelogExcerpt(text, "6.0.1", "CHANGELOG.md", "isaacs/rimraf", "main"),
    null,
  );
  assert.equal(
    extractChangelogExcerpt("# 7.0\n\n- Other", "6.0.1", "CHANGELOG.md", "isaacs/rimraf", "b".repeat(40)),
    null,
  );
});

test("selects bounded releases within an upgrade range", () => {
  const releases: GitHubRelease[] = [
    release("v3.0.0", "three"),
    release("v2.2.0", "x".repeat(100)),
    release("v2.0.0", "two"),
    release("v1.5.0", "old"),
  ];
  const selected = selectReleaseExcerpts(releases, "^1.5.0", "^2.2.0", 3, 20);
  assert.deepEqual(
    selected.map((item) => item.version),
    ["2.2.0", "2.0.0"],
  );
  assert.equal(selected[0]!.content.length, 20);
});

test("keeps the target and compatibility boundary for large upgrades", () => {
  const releases = [
    release("v6.0.3", "target"),
    release("v6.0.2", "stable"),
    release("v6.0.0", "major boundary"),
    release("v5.9.0", "intermediate"),
    release("v5.7.2", "current"),
  ];
  assert.deepEqual(
    selectReleaseExcerpts(releases, "^5.7.2", "^6.0.3", 3).map((item) => item.version),
    ["6.0.3", "6.0.0", "6.0.2"],
  );
});

test("keeps the earliest available zero-major minor boundary", () => {
  const releases = [
    release("v0.20.1", "target"),
    release("v0.20.0", "latest minor"),
    release("v0.14.0", "first newer minor"),
    release("v0.13.1", "same compatibility line"),
    release("v0.13.0", "current"),
  ];
  assert.deepEqual(
    selectReleaseExcerpts(releases, "^0.13.0", "^0.20.1", 3).map((item) => item.version),
    ["0.20.1", "0.14.0", "0.20.0"],
  );
});

test("supports additions, downgrades, and invalid release URLs", () => {
  const releases = [
    release("pkg@2.0.0", "target"),
    release("v1.0.0", "older"),
    { ...release("v1.5.0", "bad"), html_url: "javascript:alert(1)" },
  ];
  assert.deepEqual(
    selectReleaseExcerpts(releases, null, "2.0.0").map((item) => item.version),
    ["2.0.0", "1.0.0"],
  );
  assert.deepEqual(
    selectReleaseExcerpts(releases, "2.0.0", "1.0.0").map((item) => item.version),
    ["2.0.0"],
  );
  assert.deepEqual(
    selectReleaseExcerpts(releases, "1.0.0", null).map((item) => item.version),
    ["1.0.0"],
  );
});

test("rejects release tags explicitly belonging to another monorepo package", () => {
  assert.equal(releaseTagMatchesPackage("plugin-react@5.1.0", "@vitejs/plugin-react"), true);
  assert.equal(releaseTagMatchesPackage("plugin-legacy@8.2.0", "vite"), false);
  assert.equal(
    releaseTagMatchesPackage("instrumentation-aws-sdk-v0.76.0", "@opentelemetry/auto-instrumentations-node"),
    false,
  );
  assert.equal(releaseTagMatchesPackage("experimental/v0.217.0", "@opentelemetry/sdk-node"), true);
  assert.equal(releaseTagMatchesPackage("v2.0.0", "any-package"), true);
});

function release(tag: string, body: string): GitHubRelease {
  return {
    tag_name: tag,
    name: tag,
    body,
    html_url: `https://github.com/acme/pkg/releases/tag/${encodeURIComponent(tag)}`,
    draft: false,
  };
}
