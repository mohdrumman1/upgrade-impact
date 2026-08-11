export const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export type DependencySection = (typeof dependencySections)[number];

export type ChangeKind =
  | "added"
  | "removed"
  | "upgraded"
  | "downgraded"
  | "range-changed"
  | "changed";

export type VersionDelta = "major" | "minor" | "patch" | "same" | "unknown";

export type DependencyChange = {
  name: string;
  section: DependencySection;
  before: string | null;
  after: string | null;
  kind: ChangeKind;
  versionDelta: VersionDelta;
};

export type PackageManifest = Partial<
  Record<DependencySection, Record<string, string>>
> & {
  name?: string;
  version?: string;
};
