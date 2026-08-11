import {
  dependencySections,
  type ChangeKind,
  type DependencyChange,
  type DependencySection,
  type PackageManifest,
  type VersionDelta,
} from "./types.ts";

type NumericVersion = readonly [major: number, minor: number, patch: number];

const NUMERIC_VERSION = /(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)(?:[^0-9]|$)/;

export function parseManifest(input: string): PackageManifest {
  let value: unknown;

  try {
    value = JSON.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid package manifest JSON: ${message}`);
  }

  if (!isRecord(value)) {
    throw new Error("Invalid package manifest: expected a JSON object");
  }

  for (const section of dependencySections) {
    const dependencies = value[section];
    if (dependencies === undefined) continue;
    if (!isStringRecord(dependencies)) {
      throw new Error(
        `Invalid package manifest: ${section} must map package names to string versions`,
      );
    }
  }

  return value as PackageManifest;
}

export function compareManifests(
  before: PackageManifest,
  after: PackageManifest,
): DependencyChange[] {
  const changes: DependencyChange[] = [];

  for (const section of dependencySections) {
    const beforeDependencies = before[section] ?? {};
    const afterDependencies = after[section] ?? {};
    const names = new Set([
      ...Object.keys(beforeDependencies),
      ...Object.keys(afterDependencies),
    ]);

    for (const name of names) {
      const beforeSpec = beforeDependencies[name] ?? null;
      const afterSpec = afterDependencies[name] ?? null;
      if (beforeSpec === afterSpec) continue;

      changes.push(classifyChange(name, section, beforeSpec, afterSpec));
    }
  }

  return changes.sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.section.localeCompare(right.section),
  );
}

function classifyChange(
  name: string,
  section: DependencySection,
  before: string | null,
  after: string | null,
): DependencyChange {
  if (before === null) {
    return { name, section, before, after, kind: "added", versionDelta: "unknown" };
  }

  if (after === null) {
    return { name, section, before, after, kind: "removed", versionDelta: "unknown" };
  }

  const beforeVersion = extractNumericVersion(before);
  const afterVersion = extractNumericVersion(after);
  let kind: ChangeKind = "changed";
  let versionDelta: VersionDelta = "unknown";

  if (beforeVersion && afterVersion) {
    const comparison = compareNumericVersions(beforeVersion, afterVersion);
    versionDelta = describeDelta(beforeVersion, afterVersion);
    kind =
      comparison < 0
        ? "upgraded"
        : comparison > 0
          ? "downgraded"
          : "range-changed";
  }

  return { name, section, before, after, kind, versionDelta };
}

export function extractNumericVersion(spec: string): NumericVersion | null {
  if (
    spec.startsWith("workspace:") ||
    spec.startsWith("file:") ||
    spec.startsWith("link:") ||
    spec.startsWith("git+") ||
    spec.startsWith("http:") ||
    spec.startsWith("https:")
  ) {
    return null;
  }

  const match = NUMERIC_VERSION.exec(spec);
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  return [major, minor, patch];
}

function compareNumericVersions(
  before: NumericVersion,
  after: NumericVersion,
): number {
  for (let index = 0; index < before.length; index += 1) {
    const difference = before[index]! - after[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

function describeDelta(
  before: NumericVersion,
  after: NumericVersion,
): VersionDelta {
  if (before[0] !== after[0]) return "major";
  if (before[1] !== after[1]) return "minor";
  if (before[2] !== after[2]) return "patch";
  return "same";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
