import { execFile as execFileCallback } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  estimateTokens,
  renderAnalysisPrompt,
  type AnalysisDependencyInput,
  type AnalysisInput,
} from "../src/analysis-input.ts";
import {
  buildApplicabilityAnalysisInput,
  buildApplicabilityGraph,
  renderApplicabilityPrompt,
} from "../src/applicability.ts";
import {
  applicabilitySearchTargets,
  isRelevantConceptReference,
} from "../src/concept-evidence.ts";
import {
  buildExcerpt,
  parseGitGrep,
  selectBoundedMatches,
  type EvidenceExcerpt,
} from "../src/evidence.ts";
import type {
  ChangelogExcerpt,
  DocumentationExcerpt,
  ReleaseExcerpt,
} from "../src/release-evidence.ts";
import { buildPreflightFindings } from "../src/preflight.ts";
import type { DependencyChange } from "../src/types.ts";

type EvalCase = { id: string };
type EvidencePack = {
  repository: string;
  pullRequest: number;
  baseSha: string;
  evidence: Array<{ dependency: DependencyChange; excerpts: EvidenceExcerpt[] }>;
};
type ReleasePack = {
  evidence: Array<{
    dependency: DependencyChange;
    releases: ReleaseExcerpt[];
    changelog: ChangelogExcerpt | null;
    documentation: DocumentationExcerpt | null;
  }>;
};

const execFile = promisify(execFileCallback);

const cases = JSON.parse(await readFile("evals/cases.json", "utf8")) as EvalCase[];
const [stablePrompt, applicabilityPrompt] = await Promise.all([
  readFile("prompts/analysis-v1.md", "utf8"),
  readFile("prompts/analysis-v2.md", "utf8"),
]);
const summary = [];

for (const evalCase of cases) {
  const directory = `scratch/evals/${evalCase.id}`;
  const [repositoryPack, releasePack] = await Promise.all([
    readJson<EvidencePack>(`${directory}/evidence.json`),
    readJson<ReleasePack>(`${directory}/releases.json`),
  ]);
  const officialByDependency = new Map(
    releasePack.evidence.map((item) => [dependencyKey(item.dependency), item]),
  );
  const dependencies: AnalysisDependencyInput[] = repositoryPack.evidence.map((item) => {
    const official = officialByDependency.get(dependencyKey(item.dependency));
    if (!official) throw new Error(`Missing official evidence for ${evalCase.id}:${item.dependency.name}`);
    const officialEvidence: AnalysisDependencyInput["officialEvidence"] = [
      ...official.releases.map((release) => ({ source: "github-release" as const, ...release })),
      ...(official.changelog ? [{ source: "changelog" as const, ...official.changelog }] : []),
      ...(official.documentation
        ? [{ source: "official-doc" as const, ...official.documentation }]
        : []),
    ];
    return {
      dependency: item.dependency,
      repositoryEvidence: item.excerpts,
      officialEvidence,
      evidenceGap:
        officialEvidence.length === 0
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
  const prompt = renderAnalysisPrompt(stablePrompt, baseInput);
  const preflightFindings = buildPreflightFindings(baseInput);
  const initialGraph = buildApplicabilityGraph(baseInput);
  const { input, addedExcerptCount } = await addConceptDirectedEvidence(
    baseInput,
    initialGraph,
  );
  const applicabilityGraph = buildApplicabilityGraph(input);
  const applicabilityInput = buildApplicabilityAnalysisInput(input, applicabilityGraph);
  const applicabilityAnalysisPrompt = renderApplicabilityPrompt(
    applicabilityPrompt,
    applicabilityInput,
  );
  await Promise.all([
    writeFile(`${directory}/analysis-input.json`, `${JSON.stringify(baseInput, null, 2)}\n`),
    writeFile(`${directory}/analysis-prompt.md`, prompt),
    writeFile(
      `${directory}/preflight.json`,
      `${JSON.stringify({ findings: preflightFindings }, null, 2)}\n`,
    ),
    writeFile(
      `${directory}/applicability-graph.json`,
      `${JSON.stringify(applicabilityGraph, null, 2)}\n`,
    ),
    writeFile(
      `${directory}/analysis-input-v2.json`,
      `${JSON.stringify(applicabilityInput, null, 2)}\n`,
    ),
    writeFile(`${directory}/analysis-prompt-v2.md`, applicabilityAnalysisPrompt),
  ]);
  const metrics = {
    id: evalCase.id,
    characters: prompt.length,
    utf8Bytes: Buffer.byteLength(prompt),
    estimatedTokens: estimateTokens(prompt),
    dependencyCount: dependencies.length,
    evidenceGapCount: dependencies.filter((item) => item.evidenceGap !== null).length,
    applicabilityEdgeCount: applicabilityGraph.dependencies.reduce(
      (sum, item) => sum + item.edges.length,
      0,
    ),
    applicabilityEstimatedTokens: estimateTokens(applicabilityAnalysisPrompt),
    conceptSearchExcerptCount: addedExcerptCount,
    preflightFindingCount: preflightFindings.length,
  };
  summary.push(metrics);
  process.stdout.write(
    `${metrics.id}: v1 ~${metrics.estimatedTokens} tokens; v2 ~${metrics.applicabilityEstimatedTokens} tokens, ${metrics.applicabilityEdgeCount} edges, ${metrics.preflightFindingCount} preflight findings, ${metrics.conceptSearchExcerptCount} concept excerpts\n`,
  );
}

await writeFile(
  "scratch/evals/analysis-input-summary.json",
  `${JSON.stringify({ cases: summary }, null, 2)}\n`,
);

function dependencyKey(dependency: DependencyChange): string {
  return JSON.stringify([
    dependency.name,
    dependency.section,
    dependency.before,
    dependency.after,
  ]);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function addConceptDirectedEvidence(
  input: AnalysisInput,
  graph: ReturnType<typeof buildApplicabilityGraph>,
): Promise<{ input: AnalysisInput; addedExcerptCount: number }> {
  const mirror = `scratch/snapshots/${input.repository.replaceAll("/", "__")}/${input.baseSha}.git`;
  let addedExcerptCount = 0;
  const dependencies = await Promise.all(
    input.dependencies.map(async (item) => {
      const dependencyGraph = graph.dependencies.find(
        (candidate) => dependencyKey(candidate.dependency) === dependencyKey(item.dependency),
      );
      if (!dependencyGraph) throw new Error(`Missing initial graph: ${item.dependency.name}`);
      const unmatched = new Set(dependencyGraph.unmatchedReleaseFactIds);
      const targets = applicabilitySearchTargets(
        dependencyGraph.releaseFacts.filter((fact) => unmatched.has(fact.id)),
      );
      const outputs = await Promise.all(
        targets.map(async (target) => ({
          target,
          output: await gitGrep(mirror, input.baseSha, target.term),
        })),
      );
      const matches = selectBoundedMatches(
        outputs.flatMap(({ target, output }) =>
          parseGitGrep(output).filter((match) => isRelevantConceptReference(match, target)),
        ),
        6,
      );
      const excerpts = await Promise.all(
        matches.map(async (match) =>
          buildExcerpt(
            await git(mirror, ["show", `${input.baseSha}:${match.path}`]),
            match,
          ),
        ),
      );
      const existing = new Set(
        item.repositoryEvidence.map((excerpt) =>
          JSON.stringify([excerpt.path, excerpt.startLine, excerpt.endLine]),
        ),
      );
      const added = excerpts.filter(
        (excerpt) =>
          !existing.has(JSON.stringify([excerpt.path, excerpt.startLine, excerpt.endLine])),
      );
      addedExcerptCount += added.length;
      return { ...item, repositoryEvidence: [...item.repositoryEvidence, ...added] };
    }),
  );
  return { input: { ...input, dependencies }, addedExcerptCount };
}

async function gitGrep(directory: string, sha: string, pattern: string): Promise<string> {
  try {
    return await git(directory, [
      "grep",
      "-n",
      "-I",
      "-F",
      "-e",
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

function hasExitCode(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
