import { execFile as execFileCallback } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  changelogCandidatePaths,
  extractChangelogExcerpt,
  extractOfficialDocumentation,
  officialUpgradeDocumentationUrl,
  parseGitHubRepository,
  parseRepositoryDirectory,
  selectReleaseExcerpts,
  type GitHubRelease,
} from "../src/release-evidence.ts";
import type { DependencyChange } from "../src/types.ts";

type EvalCase = { id: string };
type EvidencePack = {
  evidence: Array<{ dependency: DependencyChange }>;
};
type Packument = {
  repository?: unknown;
  versions?: Record<string, { repository?: unknown; gitHead?: unknown }>;
};
type GitHubContent = {
  type: string;
  path: string;
  encoding: string;
  content: string;
};

const execFile = promisify(execFileCallback);
const cases = JSON.parse(await readFile("evals/cases.json", "utf8")) as EvalCase[];
const packuments = new Map<string, Promise<Packument>>();
const releases = new Map<string, Promise<GitHubRelease[]>>();
const contents = new Map<string, Promise<GitHubContent | null>>();

for (const evalCase of cases) {
  const directory = `scratch/evals/${evalCase.id}`;
  const pack = JSON.parse(await readFile(`${directory}/evidence.json`, "utf8")) as EvidencePack;
  const evidence = [];

  for (const { dependency } of pack.evidence) {
    const packument = await cachedPackument(dependency.name);
    const targetVersion = exactVersion(dependency.after ?? dependency.before);
    const versionMetadata = targetVersion ? packument.versions?.[targetVersion] : undefined;
    const repositoryMetadata = versionMetadata?.repository ?? packument.repository;
    const repository = parseGitHubRepository(
      repositoryMetadata,
    );
    if (repository === null) {
      evidence.push({ dependency, repository: null, releases: [], changelog: null });
      continue;
    }
    const candidates = selectReleaseExcerpts(
      await cachedReleases(repository),
      dependency.before,
      dependency.after,
      3,
      2_400,
      dependency.name,
    );
    const gitHead =
      typeof versionMetadata?.gitHead === "string" && /^[a-f0-9]{40}$/i.test(versionMetadata.gitHead)
        ? versionMetadata.gitHead
        : null;
    const changelog =
      candidates.length === 0 && targetVersion !== null && gitHead !== null
        ? await findChangelog(
            repository,
            gitHead,
            targetVersion,
            parseRepositoryDirectory(repositoryMetadata),
          )
        : null;
    const documentationUrl =
      candidates.length === 0 && changelog === null
        ? officialUpgradeDocumentationUrl(dependency.name, dependency.before, dependency.after)
        : null;
    const documentation = documentationUrl
      ? extractOfficialDocumentation(await fetchText(documentationUrl), documentationUrl)
      : null;
    evidence.push({ dependency, repository, releases: candidates, changelog, documentation });
  }

  await writeFile(
    `${directory}/releases.json`,
    `${JSON.stringify({ evidence }, null, 2)}\n`,
  );
  process.stdout.write(
    `${evalCase.id}: ${evidence.reduce((sum, item) => sum + item.releases.length, 0)} release excerpts, ${evidence.filter((item) => item.changelog !== null).length} changelog excerpts, ${evidence.filter((item) => item.documentation !== null).length} documentation excerpts\n`,
  );
}

async function findChangelog(
  repository: string,
  commit: string,
  targetVersion: string,
  directory: string | null,
) {
  for (const path of changelogCandidatePaths(directory)) {
    const file = await cachedContent(repository, commit, path);
    if (file?.type !== "file" || file.encoding !== "base64" || file.path !== path) continue;
    const excerpt = extractChangelogExcerpt(
      Buffer.from(file.content.replaceAll("\n", ""), "base64").toString("utf8"),
      targetVersion,
      path,
      repository,
      commit,
    );
    if (excerpt) return excerpt;
  }
  return null;
}

function cachedPackument(packageName: string): Promise<Packument> {
  const existing = packuments.get(packageName);
  if (existing) return existing;
  const request = fetchJson<Packument>(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
  );
  packuments.set(packageName, request);
  return request;
}

function cachedReleases(repository: string): Promise<GitHubRelease[]> {
  const existing = releases.get(repository);
  if (existing) return existing;
  const request = gh<GitHubRelease[]>(`repos/${repository}/releases?per_page=100`);
  releases.set(repository, request);
  return request;
}

function cachedContent(
  repository: string,
  commit: string,
  path: string,
): Promise<GitHubContent | null> {
  const key = `${repository}:${commit}:${path}`;
  const existing = contents.get(key);
  if (existing) return existing;
  const request = ghOrNull<GitHubContent>(
    `repos/${repository}/contents/${path}?ref=${commit}`,
  );
  contents.set(key, request);
  return request;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "forma-upgrade-impact-eval" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { accept: "text/markdown", "user-agent": "forma-upgrade-impact-eval" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function gh<T>(endpoint: string): Promise<T> {
  const { stdout } = await execFile("gh", ["api", endpoint], {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 20_000,
  });
  return JSON.parse(stdout) as T;
}

async function ghOrNull<T>(endpoint: string): Promise<T | null> {
  try {
    return await gh<T>(endpoint);
  } catch (error) {
    if (
      error instanceof Error &&
      "stderr" in error &&
      typeof error.stderr === "string" &&
      error.stderr.includes("HTTP 404")
    ) {
      return null;
    }
    throw error;
  }
}

function exactVersion(spec: string | null): string | null {
  if (spec === null) return null;
  const match = /(?:^|[^0-9])(\d+\.\d+\.\d+)(?:[^0-9]|$)/.exec(spec);
  return match?.[1] ?? null;
}
