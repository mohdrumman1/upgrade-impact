import { extractNumericVersion } from "./manifest.ts";

export type GitHubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
};

export type ReleaseExcerpt = {
  version: string;
  tag: string;
  url: string;
  content: string;
};

export type ChangelogExcerpt = {
  version: string;
  path: string;
  url: string;
  content: string;
};

export type DocumentationExcerpt = {
  version: string;
  url: string;
  content: string;
};

type NumericVersion = readonly [number, number, number];

export function officialUpgradeDocumentationUrl(
  packageName: string,
  beforeSpec: string | null,
  afterSpec: string | null,
): string | null {
  const before = beforeSpec === null ? null : extractNumericVersion(beforeSpec);
  const after = afterSpec === null ? null : extractNumericVersion(afterSpec);
  if (
    packageName !== "next" ||
    before === null ||
    after === null ||
    after[0] !== before[0] + 1 ||
    after[0] < 10 ||
    after[0] > 16
  ) {
    return null;
  }
  return `https://nextjs.org/docs/${after[0]}/app/guides/upgrading/version-${after[0]}.md`;
}

export function extractOfficialDocumentation(
  text: string,
  url: string,
  maximumCharacters: number = 2_400,
): DocumentationExcerpt | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const match = /^\/docs\/(\d+)\/app\/guides\/upgrading\/version-\1\.md$/.exec(parsed.pathname);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "nextjs.org" ||
    match === null ||
    maximumCharacters < 1
  ) {
    return null;
  }
  const content = text
    .replaceAll("\0", "")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .trim()
    .slice(0, maximumCharacters);
  return content.length === 0
    ? null
    : { version: `${match[1]}.0.0`, url: url.replace(/\.md$/, ""), content };
}

export function parseGitHubRepository(value: unknown): string | null {
  const raw =
    typeof value === "string"
      ? value
      : isRecord(value) && typeof value.url === "string"
        ? value.url
        : null;
  if (raw === null) return null;

  const normalized = raw
    .trim()
    .replace(/^github:/i, "https://github.com/")
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^git@github\.com:/, "https://github.com/");
  try {
    const url = new URL(normalized);
    if (url.hostname.toLowerCase() !== "github.com") return null;
    const segments = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const repository = `${segments[0]}/${segments[1]}`;
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
      ? repository
      : null;
  } catch {
    return null;
  }
}

export function parseRepositoryDirectory(value: unknown): string | null {
  if (!isRecord(value) || typeof value.directory !== "string") return null;
  const directory = value.directory.trim().replace(/^\.\//, "").replace(/\/$/, "");
  return isSafeRepositoryPath(directory) ? directory : null;
}

export function changelogCandidatePaths(directory: string | null): string[] {
  const names = ["CHANGELOG.md", "RELEASES.md"];
  return [
    ...(directory === null ? [] : names.map((name) => `${directory}/${name}`)),
    ...names,
  ].filter((path, index, paths) => paths.indexOf(path) === index);
}

export function extractChangelogExcerpt(
  text: string,
  targetVersion: string,
  path: string,
  repository: string,
  commit: string,
  maximumCharacters: number = 2_400,
): ChangelogExcerpt | null {
  if (
    !/^\d+\.\d+\.\d+$/.test(targetVersion) ||
    !/^[a-f0-9]{40}$/i.test(commit) ||
    parseGitHubRepository(`https://github.com/${repository}`) !== repository ||
    !isSafeRepositoryPath(path) ||
    maximumCharacters < 1
  ) {
    return null;
  }

  const versions = versionHeadingCandidates(targetVersion);
  const lines = text.replaceAll("\0", "").split(/\r?\n/);
  const headings = lines.flatMap((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    return match ? [{ index, level: match[1]!.length, title: match[2]! }] : [];
  });
  const start = headings.find((heading) =>
    versions.some((version) => headingContainsVersion(heading.title, version)),
  );
  if (!start) return null;
  const end = headings.find(
    (heading) => heading.index > start.index && heading.level <= start.level,
  );
  const content = lines
    .slice(start.index, end?.index ?? lines.length)
    .join("\n")
    .trim()
    .slice(0, maximumCharacters);
  if (content.length === 0) return null;

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return {
    version: targetVersion,
    path,
    url: `https://github.com/${repository}/blob/${commit}/${encodedPath}`,
    content,
  };
}

export function selectReleaseExcerpts(
  releases: readonly GitHubRelease[],
  beforeSpec: string | null,
  afterSpec: string | null,
  maximum: number = 3,
  maximumCharacters: number = 2_400,
  packageName: string | null = null,
): ReleaseExcerpt[] {
  const before = beforeSpec === null ? null : extractNumericVersion(beforeSpec);
  const after = afterSpec === null ? null : extractNumericVersion(afterSpec);
  const lower =
    before && after
      ? compareVersions(before, after) > 0
        ? after
        : before
      : null;
  const upper =
    before && after
      ? compareVersions(before, after) > 0
        ? before
        : after
      : after ?? before;

  const candidates = releases
    .filter(
      (release) =>
        !release.draft &&
        isHttpUrl(release.html_url) &&
        (packageName === null || releaseTagMatchesPackage(release.tag_name, packageName)),
    )
    .map((release) => ({ release, version: extractNumericVersion(release.tag_name) }))
    .filter(
      (candidate): candidate is { release: GitHubRelease; version: NumericVersion } =>
        candidate.version !== null && isWithinRange(candidate.version, lower, upper),
    )
    .sort((left, right) => compareVersions(right.version, left.version));

  return selectRepresentativeReleases(candidates, before, after, maximum)
    .map(({ release, version }) => ({
      version: version.join("."),
      tag: release.tag_name,
      url: release.html_url,
      content: boundReleaseText(release.name, release.body, maximumCharacters),
    }));
}

function selectRepresentativeReleases<T extends { version: NumericVersion }>(
  candidates: readonly T[],
  before: NumericVersion | null,
  after: NumericVersion | null,
  maximum: number,
): T[] {
  if (maximum < 1) return [];

  const selected: T[] = [];
  const add = (candidate: T | undefined) => {
    if (candidate && !selected.includes(candidate) && selected.length < maximum) {
      selected.push(candidate);
    }
  };

  add(candidates[0]);
  if (before && after && compareVersions(before, after) < 0) {
    const boundary =
      before[0] !== after[0]
        ? candidates
            .filter((candidate) => candidate.version[0] === after[0])
            .at(-1)
        : before[0] === 0 && before[1] !== after[1]
          ? candidates
              .filter((candidate) => candidate.version[1] > before[1])
              .at(-1)
          : undefined;
    add(boundary);
  }
  for (const candidate of candidates) add(candidate);
  return selected;
}

export function releaseTagMatchesPackage(tag: string, packageName: string): boolean {
  const atPrefix = /^(.+?)@v?\d/i.exec(tag)?.[1];
  const hyphenPrefix = /^(.+?)-v\d/i.exec(tag)?.[1];
  const prefix = atPrefix ?? hyphenPrefix;
  if (prefix === undefined) return true;
  const normalizedPackage = packageName.toLowerCase();
  const unscopedPackage = normalizedPackage.split("/").at(-1)!;
  const normalizedPrefix = prefix.toLowerCase();
  return normalizedPrefix === normalizedPackage || normalizedPrefix === unscopedPackage;
}

function isWithinRange(
  version: NumericVersion,
  lower: NumericVersion | null,
  upper: NumericVersion | null,
): boolean {
  if (lower && compareVersions(version, lower) <= 0) return false;
  if (upper && compareVersions(version, upper) > 0) return false;
  return lower !== null || upper !== null;
}

function compareVersions(left: NumericVersion, right: NumericVersion): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

function boundReleaseText(
  name: string | null,
  body: string | null,
  maximumCharacters: number,
): string {
  const text = [name, body]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n\n")
    .replaceAll("\0", "")
    .trim();
  return text.slice(0, maximumCharacters);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function versionHeadingCandidates(version: string): string[] {
  const [major, minor] = version.split(".");
  return [version, `${major}.${minor}`];
}

function headingContainsVersion(title: string, version: string): boolean {
  const escaped = version.replaceAll(".", "\\.");
  return new RegExp(`(?:^|[^0-9])v?${escaped}(?:[^0-9]|$)`, "i").test(title);
}

function isSafeRepositoryPath(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 240 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
