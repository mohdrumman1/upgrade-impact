import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs, promisify } from "node:util";
import {
  buildExcerpt,
  isRelevantPackageReference,
  packageReferenceTerms,
  parseGitGrep,
  selectBoundedMatches,
  type EvidenceExcerpt,
} from "../src/evidence.ts";
import type { DependencyChange } from "../src/types.ts";

type EvalCase = { id: string; repository: string; pullRequest: number };
type Metadata = { baseSha: string };
type DeterministicResult = {
  manifests: Array<{ path: string; changes: DependencyChange[] }>;
};
type Packument = { versions?: Record<string, { bin?: unknown }> };

const execFile = promisify(execFileCallback);
const { values } = parseArgs({
  options: {
    limit: { type: "string" },
    start: { type: "string", default: "0" },
  },
  strict: true,
});
const cases = JSON.parse(await readFile("evals/cases.json", "utf8")) as EvalCase[];
const packuments = new Map<string, Promise<Packument>>();
const start = parseNonNegativeInteger(values.start, "--start");
const limit =
  values.limit === undefined
    ? cases.length - start
    : parsePositiveInteger(values.limit, "--limit");

for (const evalCase of cases.slice(start, start + limit)) {
  validateRepository(evalCase.repository);
  const directory = `scratch/evals/${evalCase.id}`;
  const [metadata, deterministic] = await Promise.all([
    readJson<Metadata>(`${directory}/metadata.json`),
    readJson<DeterministicResult>(`${directory}/deterministic.json`),
  ]);
  validateSha(metadata.baseSha);
  const mirror = `scratch/snapshots/${evalCase.repository.replaceAll("/", "__")}/${metadata.baseSha}.git`;
  await ensureMirror(evalCase.repository, mirror, metadata.baseSha);

  const packages = uniqueChanges(deterministic);
  const evidence: Array<{
    dependency: DependencyChange;
    excerpts: EvidenceExcerpt[];
  }> = [];

  for (const dependency of packages) {
    const version = exactVersion(dependency.after ?? dependency.before);
    const packument = await cachedPackument(dependency.name);
    const terms = packageReferenceTerms(
      dependency.name,
      version === null ? undefined : packument.versions?.[version]?.bin,
    );
    const grepOutputs = await Promise.all(
      terms.map(async (term) => ({ term, output: await gitGrep(mirror, metadata.baseSha, term) })),
    );
    const matches = selectBoundedMatches(
      grepOutputs.flatMap(({ term, output }) =>
        parseGitGrep(output).filter((match) => isRelevantPackageReference(match, term)),
      ),
    );
    const excerpts: EvidenceExcerpt[] = [];
    for (const match of matches) {
      const fileContent = await git(mirror, ["show", `${metadata.baseSha}:${match.path}`]);
      excerpts.push(buildExcerpt(fileContent, match));
    }
    evidence.push({ dependency, excerpts });
  }

  const payload = {
    repository: evalCase.repository,
    pullRequest: evalCase.pullRequest,
    baseSha: metadata.baseSha,
    evidence,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(`${directory}/evidence.json`, serialized);
  process.stdout.write(
    `${evalCase.id}: ${packages.length} dependencies, ${evidence.reduce((sum, item) => sum + item.excerpts.length, 0)} excerpts, ~${Math.ceil(serialized.length / 4)} tokens\n`,
  );
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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "forma-upgrade-impact-eval" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return (await response.json()) as T;
}

async function ensureMirror(
  repository: string,
  directory: string,
  sha: string,
): Promise<void> {
  await mkdir(directory.slice(0, directory.lastIndexOf("/")), { recursive: true });
  try {
    await git(directory, ["cat-file", "-e", `${sha}^{commit}`]);
    return;
  } catch {
    // The exact shallow snapshot is not present yet.
  }
  await execFile("git", ["init", "--bare", directory]);
  try {
    await git(directory, ["remote", "get-url", "origin"]);
  } catch {
    await git(directory, ["remote", "add", "origin", `https://github.com/${repository}.git`]);
  }
  await git(directory, ["fetch", "--depth=1", "--no-tags", "origin", sha]);
}

async function gitGrep(directory: string, sha: string, pattern: string): Promise<string> {
  try {
    return await git(directory, [
      "grep",
      "-n",
      "-I",
      "-F",
      pattern,
      sha,
      "--",
      ".",
      ":(exclude)**/package-lock.json",
      ":(exclude)**/npm-shrinkwrap.json",
      ":(exclude)**/pnpm-lock.yaml",
      ":(exclude)**/yarn.lock",
      ":(exclude)**/bun.lock",
      ":(exclude)**/dist/**",
      ":(exclude)**/build/**",
      ":(exclude)**/vendor/**",
    ]);
  } catch (error) {
    if (hasExitCode(error, 1)) return "";
    throw error;
  }
}

async function git(directory: string, args: string[]): Promise<string> {
  const { stdout } = await execFile("git", ["--git-dir", directory, ...args], {
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
}

function uniqueChanges(result: DeterministicResult): DependencyChange[] {
  const changes = new Map<string, DependencyChange>();
  for (const manifest of result.manifests) {
    for (const change of manifest.changes) {
      const key = `${change.section}:${change.name}:${change.before}:${change.after}`;
      changes.set(key, change);
    }
  }
  return [...changes.values()];
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function validateRepository(repository: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Unsafe repository identifier: ${repository}`);
  }
}

function validateSha(sha: string): void {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`Unsafe commit SHA: ${sha}`);
}

function parseNonNegativeInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function hasExitCode(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function exactVersion(spec: string | null): string | null {
  if (spec === null) return null;
  return /(?:^|[^0-9])(\d+\.\d+\.\d+)(?:[^0-9]|$)/.exec(spec)?.[1] ?? null;
}
