import { readFile } from "node:fs/promises";
import type { AnalysisInput } from "../src/analysis-input.ts";
import { parseAnalysisResult } from "../src/analysis-schema.ts";
import { verifyAnalysisApplicability, type ApplicabilityGraph } from "../src/applicability.ts";
import { verifyAnalysisEvidence } from "../src/analysis-verification.ts";

type Score = {
  id: string;
  scores: number[];
  total: number;
  useful: boolean;
  unsupportedMaterialClaim: boolean;
  includesPreflight?: boolean;
};
type Scorecard = {
  provider: string;
  model: string;
  promptVersion?: "v1" | "v2";
  cases: Score[];
};

const scorePath =
  process.argv.slice(2).find((argument) => argument !== "--") ??
  "evals/openrouter-deepseek-flash-scores.json";
const scorecard = JSON.parse(await readFile(scorePath, "utf8")) as Scorecard;
const ids = new Set<string>();

for (const item of scorecard.cases) {
  if (ids.has(item.id)) throw new Error(`Duplicate score: ${item.id}`);
  ids.add(item.id);
  if (
    item.scores.length !== 5 ||
    item.scores.some((score) => !Number.isInteger(score) || score < 0 || score > 2) ||
    item.scores.reduce((sum, score) => sum + score, 0) !== item.total
  ) {
    throw new Error(`Invalid score: ${item.id}`);
  }
  const promptVersion = scorecard.promptVersion ?? "v1";
  const [inputText, artifactText, graphText, preflightText] = await Promise.all([
    readFile(`scratch/evals/${item.id}/analysis-input.json`, "utf8"),
    readFile(
      `scratch/benchmarks/${scorecard.provider}/${promptVersion === "v2" ? "v2/" : ""}${item.id}/result.json`,
      "utf8",
    ),
    promptVersion === "v2"
      ? readFile(`scratch/evals/${item.id}/applicability-graph.json`, "utf8")
      : Promise.resolve(null),
    item.includesPreflight
      ? readFile(`scratch/evals/${item.id}/preflight.json`, "utf8")
      : Promise.resolve(null),
  ]);
  const artifact = JSON.parse(artifactText) as {
    provider: string;
    model: string;
    analysis: unknown;
  };
  if (artifact.provider !== scorecard.provider || artifact.model !== scorecard.model) {
    throw new Error(`${item.id}: provider or model mismatch`);
  }
  const result = parseAnalysisResult(JSON.stringify(artifact.analysis));
  const verification = graphText === null
    ? verifyAnalysisEvidence(result, JSON.parse(inputText) as AnalysisInput)
    : verifyAnalysisApplicability(result, JSON.parse(graphText) as ApplicabilityGraph);
  if (!verification.valid) throw new Error(`${item.id}: ${verification.errors.join("; ")}`);
  if (preflightText !== null) {
    const preflight = JSON.parse(preflightText) as { findings?: unknown[] };
    if (!Array.isArray(preflight.findings) || preflight.findings.length === 0) {
      throw new Error(`${item.id}: score includes a missing deterministic preflight finding`);
    }
  }
}

const total = scorecard.cases.reduce((sum, item) => sum + item.total, 0);
const useful = scorecard.cases.filter((item) => item.useful).length;
const unsupported = scorecard.cases.filter((item) => item.unsupportedMaterialClaim).length;
process.stdout.write(
  `${scorecard.cases.length} reports: ${(total / scorecard.cases.length).toFixed(3)}/10 mean; ${useful} useful; ${unsupported} with unsupported material claims\n`,
);
