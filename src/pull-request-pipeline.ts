import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { renderAnalysisMarkdown } from "./analysis-report.ts";
import {
  buildApplicabilityAnalysisInput,
  buildApplicabilityGraph,
  renderApplicabilityPrompt,
  type ApplicabilityAnalysisInput,
} from "./applicability.ts";
import type { AnalysisDependencyInput, AnalysisInput } from "./analysis-input.ts";
import { applicabilitySearchTargets, isRelevantConceptReference } from "./concept-evidence.ts";
import { buildDeterministicAnalysis } from "./deterministic-analysis.ts";
import {
  buildExcerpt,
  isRelevantPackageReference,
  packageReferenceTerms,
  parseGitGrep,
  selectBoundedMatches,
  type EvidenceExcerpt,
} from "./evidence.ts";
import { analysisRunId } from "./github-event.ts";
import { GitHubApi, type GitHubPullRequest } from "./github-api.ts";
import { requestHostedAnalysis } from "./hosted-client.ts";
import { compareManifests, parseManifest } from "./manifest.ts";
import { analysePrepared, type PreparedAnalysisMetadata } from "./prepared-analysis.ts";
import { buildPreflightFindings } from "./preflight.ts";
import {
  changelogCandidatePaths,
  extractChangelogExcerpt,
  extractOfficialDocumentation,
  officialUpgradeDocumentationUrl,
  parseGitHubRepository,
  parseRepositoryDirectory,
  selectReleaseExcerpts,
  type ChangelogExcerpt,
  type DocumentationExcerpt,
  type GitHubRelease,
  type ReleaseExcerpt,
} from "./release-evidence.ts";
import type { DependencyChange } from "./types.ts";

type Packument = {
  repository?: unknown;
  versions?: Record<string, { bin?: unknown; repository?: unknown; gitHead?: unknown }>;
};

type RepositoryEvidence = {
  repository: string;
  pullRequest: number;
  baseSha: string;
  evidence: Array<{ dependency: DependencyChange; excerpts: EvidenceExcerpt[] }>;
};

type ReleaseEvidence = {
  evidence: Array<{
    dependency: DependencyChange;
    releases: ReleaseExcerpt[];
    changelog: ChangelogExcerpt | null;
    documentation: DocumentationExcerpt | null;
  }>;
};

export type PullRequestPipelineOptions = {
  repository: string;
  pullRequest: number;
  stateDirectory: string;
  githubToken: string;
  openRouterApiKey?: string;
  hostedEndpoint?: string;
  hostedToken?: string;
  githubApiUrl?: string;
  provider?: string;
  maximumUsd?: number;
  expectedHeadSha?: string;
  notice?: (message: string) => void;
};

export type PullRequestPipelineResult = {
  runId: string;
  runDirectory: string;
  reportPath: string;
  metadataPath: string;
  headSha: string;
  dependencyChanges: number;
  model: PreparedAnalysisMetadata | null;
  cacheHit: boolean;
};

const execFile = promisify(execFileCallback);
const MAX_MANIFESTS = 20;
const MAX_DEPENDENCY_CHANGES = 30;
const MAX_MANIFEST_BYTES = 1_000_000;

export async function runPublicPullRequestPipeline(
  options: PullRequestPipelineOptions,
): Promise<PullRequestPipelineResult> {
  validateRepository(options.repository);
  if (!Number.isSafeInteger(options.pullRequest) || options.pullRequest < 1) {
    throw new Error("Pull request number must be a positive integer");
  }
  const github = new GitHubApi(options.githubToken, options.githubApiUrl);
  const pull = await github.getPullRequest(options.repository, options.pullRequest);
  validatePullRequest(pull, options.repository);
  if (options.expectedHeadSha && pull.head.sha !== options.expectedHeadSha) {
    throw new Error("Pull request head changed while this analysis run was queued");
  }
  const runId = analysisRunId(
    options.repository,
    options.pullRequest,
    pull.base.sha,
    pull.head.sha,
  );
  const runDirectory = join(options.stateDirectory, runId);
  const reportPath = join(runDirectory, "report.md");
  const metadataPath = join(runDirectory, "model-metadata.json");
  await mkdir(runDirectory, { recursive: true });

  if (await exists(reportPath)) {
    const metadata = parsePreparedMetadata(await readOptionalJson<unknown>(metadataPath));
    options.notice?.(`Reused verified report ${runId}`);
    return {
      runId,
      runDirectory,
      reportPath,
      metadataPath,
      headSha: pull.head.sha,
      dependencyChanges: await cachedChangeCount(runDirectory),
      model: metadata,
      cacheHit: true,
    };
  }

  const deterministicPath = join(runDirectory, "deterministic.json");
  const deterministic = await readOptionalJson<{
    manifests: Array<{ path: string; changes: DependencyChange[] }>;
  }>(deterministicPath);
  const changes = deterministic
    ? uniqueChanges(deterministic.manifests.flatMap((item) => item.changes))
    : await acquireManifestChanges(github, pull, runDirectory);
  if (changes.length === 0) {
    await writeFile(reportPath, "## UpgradeImpact\n\nNo dependency manifest changes detected.\n");
    await writeFile(metadataPath, `${JSON.stringify({ skipped: "no-dependency-changes" }, null, 2)}\n`);
    return result(null, false);
  }
  if (changes.length > MAX_DEPENDENCY_CHANGES) {
    throw new Error(`Pull request has ${changes.length} dependency changes; limit is ${MAX_DEPENDENCY_CHANGES}`);
  }

  const mirror = join(options.stateDirectory, "snapshots", `${options.repository.replace("/", "__")}__${pull.base.sha}.git`);
  await ensureMirror(options.repository, mirror, pull.base.sha);
  const evidencePath = join(runDirectory, "evidence.json");
  const repositoryEvidence = await readOptionalJson<RepositoryEvidence>(evidencePath) ??
    await acquireRepositoryEvidence(
      options.repository,
      options.pullRequest,
      pull.base.sha,
      changes,
      mirror,
    );
  if (!(await exists(evidencePath))) await writeJson(evidencePath, repositoryEvidence);
  const releasesPath = join(runDirectory, "releases.json");
  const releaseEvidence = await readOptionalJson<ReleaseEvidence>(releasesPath) ??
    await acquireReleaseEvidence(github, repositoryEvidence);
  if (!(await exists(releasesPath))) await writeJson(releasesPath, releaseEvidence);
  const prepared = await readPreparedArtifacts(runDirectory) ??
    await prepareAnalysis(repositoryEvidence, releaseEvidence, mirror, runDirectory);

  const edgeCount = prepared.graph.dependencies.reduce((sum, item) => sum + item.edges.length, 0);
  if (edgeCount === 0) {
    const analysis = buildDeterministicAnalysis(prepared.graph);
    await writeFile(reportPath, renderAnalysisMarkdown(analysis, prepared.preflight));
    await writeFile(metadataPath, `${JSON.stringify({ skipped: "no-applicability-edges", spendUsd: 0 }, null, 2)}\n`);
    return result(null, false);
  }
  if ((options.hostedEndpoint && !options.hostedToken) || (!options.hostedEndpoint && options.hostedToken)) {
    throw new Error("Hosted endpoint and license key must be configured together");
  }
  let model: PreparedAnalysisMetadata;
  if (options.hostedEndpoint && options.hostedToken) {
    const analysisInput = await readOptionalJson<ApplicabilityAnalysisInput>(prepared.analysisInputPath);
    if (!analysisInput) throw new Error("Invalid hosted analysis input artifact");
    const hosted = await requestHostedAnalysis({
      endpoint: options.hostedEndpoint,
      token: options.hostedToken,
      requestId: runId,
      analysisInput,
      graph: prepared.graph,
    });
    await Promise.all([
      writeFile(reportPath, renderAnalysisMarkdown(hosted.analysis, prepared.preflight)),
      writeJson(metadataPath, hosted.metadata),
    ]);
    model = hosted.metadata;
  } else {
    if (!options.openRouterApiKey) throw new Error("Missing hosted license key or OPENROUTER_API_KEY");
    model = await analysePrepared({
      promptPath: prepared.promptPath,
      graphPath: prepared.graphPath,
      preflightPath: prepared.preflightPath,
      outputPath: reportPath,
      metadataPath,
      provider: options.provider ?? "openrouter-openai-mini",
      maximumUsd: options.maximumUsd ?? 0.02,
      apiKey: options.openRouterApiKey,
      ...(options.notice ? { notice: options.notice } : {}),
    });
  }
  return result(model, false);

  function result(model: PreparedAnalysisMetadata | null, cacheHit: boolean): PullRequestPipelineResult {
    return {
      runId,
      runDirectory,
      reportPath,
      metadataPath,
      headSha: pull.head.sha,
      dependencyChanges: changes.length,
      model,
      cacheHit,
    };
  }
}

async function acquireManifestChanges(
  github: GitHubApi,
  pull: GitHubPullRequest,
  directory: string,
): Promise<DependencyChange[]> {
  const files = await github.listPullFiles(pull.base.repo.full_name, pull.number);
  const manifests = files.filter((file) =>
    file.filename === "package.json" || file.filename.endsWith("/package.json"),
  );
  if (manifests.length > MAX_MANIFESTS) {
    throw new Error(`Pull request changes ${manifests.length} package manifests; limit is ${MAX_MANIFESTS}`);
  }
  const results = [];
  for (const manifest of manifests) {
    const beforePath = manifest.previous_filename ?? manifest.filename;
    const [beforeText, afterText] = await Promise.all([
      github.getContent(pull.base.repo.full_name, beforePath, pull.base.sha),
      pull.head.repo === null
        ? Promise.resolve(null)
        : github.getContent(pull.head.repo.full_name, manifest.filename, pull.head.sha),
    ]);
    enforceManifestSize(beforeText, beforePath);
    enforceManifestSize(afterText, manifest.filename);
    const before = parseManifest(beforeText ?? "{}");
    const after = parseManifest(afterText ?? "{}");
    results.push({ path: manifest.filename, changes: compareManifests(before, after) });
  }
  await writeJson(join(directory, "deterministic.json"), { manifests: results });
  return uniqueChanges(results.flatMap((item) => item.changes));
}

async function acquireRepositoryEvidence(
  repository: string,
  pullRequest: number,
  baseSha: string,
  changes: DependencyChange[],
  mirror: string,
): Promise<RepositoryEvidence> {
  const packuments = new Map<string, Promise<Packument>>();
  const evidence = [];
  for (const dependency of changes) {
    const packument = await cachedPackument(packuments, dependency.name);
    const version = exactVersion(dependency.after ?? dependency.before);
    const terms = packageReferenceTerms(dependency.name, version ? packument.versions?.[version]?.bin : undefined);
    const outputs = await Promise.all(terms.map(async (term) => ({ term, output: await gitGrep(mirror, baseSha, term) })));
    const matches = selectBoundedMatches(
      outputs.flatMap(({ term, output }) =>
        parseGitGrep(output).filter((match) => isRelevantPackageReference(match, term)),
      ),
    );
    const excerpts = await Promise.all(
      matches.map(async (match) => buildExcerpt(await git(mirror, ["show", `${baseSha}:${match.path}`]), match)),
    );
    evidence.push({ dependency, excerpts });
  }
  return { repository, pullRequest, baseSha, evidence };
}

async function acquireReleaseEvidence(
  github: GitHubApi,
  pack: RepositoryEvidence,
): Promise<ReleaseEvidence> {
  const packuments = new Map<string, Promise<Packument>>();
  const releases = new Map<string, Promise<GitHubRelease[]>>();
  const evidence = [];
  for (const { dependency } of pack.evidence) {
    const packument = await cachedPackument(packuments, dependency.name);
    const targetVersion = exactVersion(dependency.after ?? dependency.before);
    const versionMetadata = targetVersion ? packument.versions?.[targetVersion] : undefined;
    const repositoryMetadata = versionMetadata?.repository ?? packument.repository;
    const officialRepository = parseGitHubRepository(repositoryMetadata);
    if (officialRepository === null) {
      evidence.push({ dependency, releases: [], changelog: null, documentation: null });
      continue;
    }
    let releaseRequest = releases.get(officialRepository);
    if (!releaseRequest) {
      releaseRequest = github.listReleases<GitHubRelease>(officialRepository);
      releases.set(officialRepository, releaseRequest);
    }
    const candidates = selectReleaseExcerpts(
      await releaseRequest,
      dependency.before,
      dependency.after,
      3,
      2_400,
      dependency.name,
    );
    const gitHead = typeof versionMetadata?.gitHead === "string" && /^[a-f0-9]{40}$/i.test(versionMetadata.gitHead)
      ? versionMetadata.gitHead
      : null;
    const changelog = candidates.length === 0 && targetVersion && gitHead
      ? await findChangelog(github, officialRepository, gitHead, targetVersion, parseRepositoryDirectory(repositoryMetadata))
      : null;
    const documentationUrl = candidates.length === 0 && changelog === null
      ? officialUpgradeDocumentationUrl(dependency.name, dependency.before, dependency.after)
      : null;
    const documentation = documentationUrl
      ? extractOfficialDocumentation(await fetchText(documentationUrl), documentationUrl)
      : null;
    evidence.push({ dependency, releases: candidates, changelog, documentation });
  }
  return { evidence };
}

async function prepareAnalysis(
  repositoryPack: RepositoryEvidence,
  releasePack: ReleaseEvidence,
  mirror: string,
  directory: string,
) {
  const officialByDependency = new Map(releasePack.evidence.map((item) => [dependencyKey(item.dependency), item]));
  const dependencies: AnalysisDependencyInput[] = repositoryPack.evidence.map((item) => {
    const official = officialByDependency.get(dependencyKey(item.dependency));
    if (!official) throw new Error(`Missing official evidence for ${item.dependency.name}`);
    const officialEvidence: AnalysisDependencyInput["officialEvidence"] = [
      ...official.releases.map((release) => ({ source: "github-release" as const, ...release })),
      ...(official.changelog ? [{ source: "changelog" as const, ...official.changelog }] : []),
      ...(official.documentation ? [{ source: "official-doc" as const, ...official.documentation }] : []),
    ];
    return {
      dependency: item.dependency,
      repositoryEvidence: item.excerpts,
      officialEvidence,
      evidenceGap: officialEvidence.length === 0
        ? "No bounded official release or changelog excerpt was found; omit unsupported findings."
        : null,
    };
  });
  const baseInput: AnalysisInput = {
    repository: repositoryPack.repository,
    pullRequest: repositoryPack.pullRequest,
    baseSha: repositoryPack.baseSha,
    dependencies,
  };
  const preflight = buildPreflightFindings(baseInput);
  const initialGraph = buildApplicabilityGraph(baseInput);
  const input = await addConceptDirectedEvidence(baseInput, initialGraph, mirror);
  const graph = buildApplicabilityGraph(input);
  const analysisInput = buildApplicabilityAnalysisInput(input, graph);
  const stablePrompt = await readFile(new URL("../prompts/analysis-v2.md", import.meta.url), "utf8");
  const prompt = renderApplicabilityPrompt(stablePrompt, analysisInput);
  const promptPath = join(directory, "analysis-prompt-v2.md");
  const graphPath = join(directory, "applicability-graph.json");
  const preflightPath = join(directory, "preflight.json");
  await Promise.all([
    writeJson(join(directory, "analysis-input-v2.json"), analysisInput),
    writeJson(graphPath, graph),
    writeJson(preflightPath, { findings: preflight }),
    writeFile(promptPath, prompt),
  ]);
  return { graph, preflight, promptPath, graphPath, preflightPath, analysisInputPath: join(directory, "analysis-input-v2.json") };
}

async function addConceptDirectedEvidence(
  input: AnalysisInput,
  graph: ReturnType<typeof buildApplicabilityGraph>,
  mirror: string,
): Promise<AnalysisInput> {
  const dependencies = await Promise.all(input.dependencies.map(async (item) => {
    const dependencyGraph = graph.dependencies.find(
      (candidate) => dependencyKey(candidate.dependency) === dependencyKey(item.dependency),
    );
    if (!dependencyGraph) throw new Error(`Missing initial graph: ${item.dependency.name}`);
    const unmatched = new Set(dependencyGraph.unmatchedReleaseFactIds);
    const targets = applicabilitySearchTargets(
      dependencyGraph.releaseFacts.filter((fact) => unmatched.has(fact.id)),
    );
    const outputs = await Promise.all(
      targets.map(async (target) => ({ target, output: await gitGrep(mirror, input.baseSha, target.term) })),
    );
    const matches = selectBoundedMatches(
      outputs.flatMap(({ target, output }) =>
        parseGitGrep(output).filter((match) => isRelevantConceptReference(match, target)),
      ),
      6,
    );
    const excerpts = await Promise.all(
      matches.map(async (match) => buildExcerpt(await git(mirror, ["show", `${input.baseSha}:${match.path}`]), match)),
    );
    const existing = new Set(item.repositoryEvidence.map((excerpt) =>
      JSON.stringify([excerpt.path, excerpt.startLine, excerpt.endLine]),
    ));
    return {
      ...item,
      repositoryEvidence: [
        ...item.repositoryEvidence,
        ...excerpts.filter((excerpt) => !existing.has(JSON.stringify([excerpt.path, excerpt.startLine, excerpt.endLine]))),
      ],
    };
  }));
  return { ...input, dependencies };
}

async function findChangelog(
  github: GitHubApi,
  repository: string,
  commit: string,
  targetVersion: string,
  repositoryDirectory: string | null,
): Promise<ChangelogExcerpt | null> {
  for (const path of changelogCandidatePaths(repositoryDirectory)) {
    const file = await github.getContentResponse(repository, path, commit);
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

async function cachedPackument(cache: Map<string, Promise<Packument>>, packageName: string): Promise<Packument> {
  let request = cache.get(packageName);
  if (!request) {
    request = fetchJson<Packument>(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
    cache.set(packageName, request);
  }
  return request;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "forma-upgrade-impact-action" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for official package metadata`);
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { accept: "text/markdown", "user-agent": "forma-upgrade-impact-action" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for official documentation`);
  return response.text();
}

async function ensureMirror(repository: string, directory: string, sha: string): Promise<void> {
  await mkdir(dirname(directory), { recursive: true });
  if (await exists(directory)) {
    try {
      await git(directory, ["cat-file", "-e", `${sha}^{commit}`]);
      return;
    } catch {
      // Fetch the missing immutable snapshot below.
    }
  } else {
    await execFile("git", ["init", "--bare", directory], { timeout: 20_000 });
  }
  try {
    await git(directory, ["remote", "get-url", "origin"]);
  } catch {
    await git(directory, ["remote", "add", "origin", `https://github.com/${repository}.git`]);
  }
  await git(directory, ["fetch", "--depth=1", "--no-tags", "origin", sha], 60_000);
}

async function gitGrep(directory: string, sha: string, pattern: string): Promise<string> {
  try {
    return await git(directory, [
      "grep", "-n", "-I", "-F", "-e", pattern, sha, "--", ".",
      ":(exclude)**/package-lock.json", ":(exclude)**/npm-shrinkwrap.json",
      ":(exclude)**/pnpm-lock.yaml", ":(exclude)**/yarn.lock", ":(exclude)**/bun.lock",
      ":(exclude)**/dist/**", ":(exclude)**/build/**", ":(exclude)**/vendor/**",
    ]);
  } catch (error) {
    if (hasExitCode(error, 1)) return "";
    throw error;
  }
}

async function git(directory: string, args: string[], timeout = 20_000): Promise<string> {
  const { stdout } = await execFile("git", ["--git-dir", directory, ...args], {
    maxBuffer: 4 * 1024 * 1024,
    timeout,
  });
  return stdout;
}

function validatePullRequest(pull: GitHubPullRequest, repository: string): void {
  if (pull.base.repo.full_name !== repository || pull.base.repo.private || pull.head.repo?.private) {
    throw new Error("Only public pull requests targeting the requested public repository are enabled");
  }
  if (pull.head.repo === null) throw new Error("Pull request head repository is unavailable");
  validateSha(pull.base.sha);
  validateSha(pull.head.sha);
}

function validateRepository(repository: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Unsafe repository identifier: ${repository}`);
  }
}

function validateSha(sha: string): void {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Unsafe commit SHA");
}

function enforceManifestSize(value: string | null, path: string): void {
  if (value !== null && Buffer.byteLength(value) > MAX_MANIFEST_BYTES) {
    throw new Error(`Manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${path}`);
  }
}

function exactVersion(spec: string | null): string | null {
  if (spec === null) return null;
  return /(?:^|[^0-9])(\d+\.\d+\.\d+)(?:[^0-9]|$)/.exec(spec)?.[1] ?? null;
}

function dependencyKey(dependency: DependencyChange): string {
  return JSON.stringify([dependency.name, dependency.section, dependency.before, dependency.after]);
}

function uniqueChanges(changes: DependencyChange[]): DependencyChange[] {
  return [...new Map(changes.map((change) => [dependencyKey(change), change])).values()];
}

function hasExitCode(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function cachedChangeCount(directory: string): Promise<number> {
  const artifact = await readOptionalJson<{ manifests?: Array<{ changes?: unknown[] }> }>(join(directory, "deterministic.json"));
  return artifact?.manifests?.reduce((sum, item) => sum + (item.changes?.length ?? 0), 0) ?? 0;
}

async function readPreparedArtifacts(directory: string): Promise<{
  graph: ReturnType<typeof buildApplicabilityGraph>;
  preflight: ReturnType<typeof buildPreflightFindings>;
  promptPath: string;
  graphPath: string;
  preflightPath: string;
  analysisInputPath: string;
} | null> {
  const promptPath = join(directory, "analysis-prompt-v2.md");
  const graphPath = join(directory, "applicability-graph.json");
  const preflightPath = join(directory, "preflight.json");
  const analysisInputPath = join(directory, "analysis-input-v2.json");
  if (!(await exists(promptPath)) || !(await exists(graphPath)) || !(await exists(preflightPath)) ||
    !(await exists(analysisInputPath))) {
    return null;
  }
  const [graph, preflight] = await Promise.all([
    readOptionalJson<ReturnType<typeof buildApplicabilityGraph>>(graphPath),
    readOptionalJson<{ findings: ReturnType<typeof buildPreflightFindings> }>(preflightPath),
  ]);
  if (!graph || !preflight || !Array.isArray(preflight.findings)) return null;
  return { graph, preflight: preflight.findings, promptPath, graphPath, preflightPath, analysisInputPath };
}

function parsePreparedMetadata(value: unknown): PreparedAnalysisMetadata | null {
  if (
    typeof value !== "object" || value === null ||
    !("provider" in value) || typeof value.provider !== "string" ||
    !("model" in value) || typeof value.model !== "string" ||
    !("requestHash" in value) || typeof value.requestHash !== "string" ||
    !("spendUsd" in value) || typeof value.spendUsd !== "number" ||
    !("attempts" in value) || typeof value.attempts !== "number" ||
    !("usage" in value) || !Array.isArray(value.usage) ||
    !("latencyMs" in value) || typeof value.latencyMs !== "number"
  ) return null;
  return value as PreparedAnalysisMetadata;
}
