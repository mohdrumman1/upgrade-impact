import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { AnalysisInput } from "../src/analysis-input.ts";
import { parseAnalysisResult } from "../src/analysis-schema.ts";
import type { AnalysisResult } from "../src/analysis-schema.ts";
import {
  verifyAnalysisApplicability,
  type ApplicabilityGraph,
} from "../src/applicability.ts";
import { verifyAnalysisEvidence } from "../src/analysis-verification.ts";
import type { VerificationResult } from "../src/analysis-verification.ts";
import {
  calculateModelCostUsd,
  buildChatCompletionRequest,
  estimateMaximumModelCostUsd,
  type ModelResponse,
} from "../src/model-process.ts";
import { callWithRateLimitBackoff } from "../src/model-retry.ts";
import {
  PROVIDER_PROFILES,
  providerProfile,
  type ProviderId,
} from "../src/model-providers.ts";

type EvalCase = { id: string };
type Options = {
  execute: boolean;
  provider: string | null;
  maximumUsd: number | null;
  maximumOutputTokens: number;
  start: number;
  limit: number;
  promptVersion: "v1" | "v2";
};
type AttemptArtifact = {
  response: ModelResponse;
  costUsd: number;
  latencyMs: number;
};
type ResultArtifact = {
  provider: string;
  model: string;
  promptSha256: string;
  requestSha256: string;
  attempts: AttemptArtifact[];
  analysis: AnalysisResult;
  verification: VerificationResult;
};

const options = parseOptions(process.argv.slice(2));
const cases = (JSON.parse(await readFile("evals/cases.json", "utf8")) as EvalCase[]).slice(
  options.start,
  options.start + options.limit,
);

if (!options.execute) {
  await printDryRun(cases, options.maximumOutputTokens);
  process.exit(0);
}
if (options.provider === null || options.maximumUsd === null) {
  throw new Error("Execution requires --provider and --max-usd");
}
if (options.maximumUsd <= 0 || options.maximumUsd > 1) {
  throw new Error("--max-usd must be greater than 0 and no more than 1");
}

const profile = providerProfile(options.provider);
const apiKey = process.env[profile.apiKeyEnvironmentVariable];
if (!apiKey) throw new Error(`Missing ${profile.apiKeyEnvironmentVariable}`);
const benchmarkDirectory = `scratch/benchmarks/${profile.id}`;
await mkdir(benchmarkDirectory, { recursive: true });

let newSpendUsd = 0;
let validReports = 0;
let reportsWithFindings = 0;
const results = [];

for (const evalCase of cases) {
  const directory = `scratch/evals/${evalCase.id}`;
  const outputDirectory = `${benchmarkDirectory}/${options.promptVersion}/${evalCase.id}`;
  await mkdir(outputDirectory, { recursive: true });
  const [prompt, inputText, graphText] = await Promise.all([
    readFile(
      `${directory}/${options.promptVersion === "v2" ? "analysis-prompt-v2.md" : "analysis-prompt.md"}`,
      "utf8",
    ),
    readFile(`${directory}/analysis-input.json`, "utf8"),
    options.promptVersion === "v2"
      ? readFile(`${directory}/applicability-graph.json`, "utf8")
      : Promise.resolve(null),
  ]);
  const input = JSON.parse(inputText) as AnalysisInput;
  const graph = graphText === null ? null : JSON.parse(graphText) as ApplicabilityGraph;
  const verify = (analysis: AnalysisResult): VerificationResult =>
    graph === null
      ? verifyAnalysisEvidence(analysis, input)
      : verifyAnalysisApplicability(analysis, graph);
  const promptSha256 = createHash("sha256").update(prompt).digest("hex");
  const requestSha256 = createHash("sha256")
    .update(JSON.stringify(buildChatCompletionRequest(profile, prompt, options.maximumOutputTokens)))
    .digest("hex");
  const cached = await readCachedResult(
    `${outputDirectory}/result.json`,
    profile.id,
    profile.model,
    promptSha256,
    requestSha256,
    verify,
  );
  if (cached !== null) {
    validReports += 1;
    if (cached.analysis.findings.length > 0) reportsWithFindings += 1;
    const costUsd = cached.attempts.reduce((sum, item) => sum + item.costUsd, 0);
    results.push({
      id: evalCase.id,
      cached: true,
      attempts: cached.attempts.length,
      findings: cached.analysis.findings.length,
      costUsd,
      usage: cached.attempts.map((item) => item.response.usage),
    });
    process.stdout.write(
      `${evalCase.id}: cached valid result, ${cached.analysis.findings.length} findings, ${formatUsd(costUsd)} historical cost\n`,
    );
    continue;
  }
  const maximumRequestCost = estimateMaximumModelCostUsd(
    maximumInputTokens(prompt),
    options.maximumOutputTokens,
    profile.pricesUsdPerMillion,
  );
  if (newSpendUsd + maximumRequestCost > options.maximumUsd) {
    throw new Error(
      `Spend cap would be exceeded before ${evalCase.id}: ${formatUsd(newSpendUsd + maximumRequestCost)} > ${formatUsd(options.maximumUsd)}`,
    );
  }

  const attempts: AttemptArtifact[] = [];
  let parsed: AnalysisResult | null = null;
  let verification: VerificationResult | null = null;
  let lastError = "Unknown processing failure";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = performance.now();
    try {
      const response = await callWithRateLimitBackoff(
        profile,
        prompt,
        apiKey,
        options.maximumOutputTokens,
        {
          notice: (delayMs) =>
            process.stdout.write(`Rate limited; resuming in ${delayMs / 1_000}s\n`),
        },
      );
      const artifact = {
        response,
        costUsd:
          response.chargedCostUsd ??
          calculateModelCostUsd(response.usage, profile.pricesUsdPerMillion),
        latencyMs: Math.round(performance.now() - startedAt),
      };
      attempts.push(artifact);
      newSpendUsd += artifact.costUsd;
      parsed = parseAnalysisResult(response.content);
      verification = verify(parsed);
      if (!verification.valid) throw new Error(verification.errors.join("; "));
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 1) break;
      if (newSpendUsd + maximumRequestCost > options.maximumUsd) break;
    }
  }
  if (parsed === null || verification === null || !verification.valid) {
    await writeFile(
      `${outputDirectory}/failure.json`,
      `${JSON.stringify({ provider: profile.id, model: profile.model, attempts, error: lastError }, null, 2)}\n`,
    );
    throw new Error(`${evalCase.id}: ${lastError}`);
  }

  validReports += 1;
  if (parsed.findings.length > 0) reportsWithFindings += 1;
  const artifact: ResultArtifact = {
    provider: profile.id,
    model: profile.model,
    promptSha256,
    requestSha256,
    attempts,
    analysis: parsed,
    verification,
  };
  await writeFile(`${outputDirectory}/result.json`, `${JSON.stringify(artifact, null, 2)}\n`);
  results.push({
    id: evalCase.id,
    attempts: attempts.length,
    findings: parsed.findings.length,
    costUsd: attempts.reduce((sum, item) => sum + item.costUsd, 0),
    usage: attempts.map((item) => item.response.usage),
  });
  process.stdout.write(
    `${evalCase.id}: valid, ${parsed.findings.length} findings, ${formatUsd(results.at(-1)!.costUsd)}\n`,
  );
}

const summary = {
  provider: profile.id,
  model: profile.model,
  cases: results,
  validReports,
  reportsWithFindings,
  historicalCostUsd: results.reduce((sum, item) => sum + item.costUsd, 0),
  newSpendUsd,
  maximumUsd: options.maximumUsd,
  promptVersion: options.promptVersion,
};
await writeFile(
  `${benchmarkDirectory}/summary-${options.promptVersion}.json`,
  `${JSON.stringify(summary, null, 2)}\n`,
);
process.stdout.write(
  `${validReports}/${cases.length} valid; ${reportsWithFindings} with findings; ${formatUsd(newSpendUsd)} new spend\n`,
);

async function readCachedResult(
  path: string,
  provider: string,
  model: string,
  promptSha256: string,
  requestSha256: string,
  verify: (analysis: AnalysisResult) => VerificationResult,
): Promise<ResultArtifact | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`Invalid cached benchmark JSON: ${path}`);
  }
  if (
    !isRecord(value) ||
    value.provider !== provider ||
    value.model !== model ||
    value.promptSha256 !== promptSha256 ||
    value.requestSha256 !== requestSha256 ||
    !Array.isArray(value.attempts)
  ) {
    throw new Error(`Stale or invalid cached benchmark result: ${path}`);
  }
  try {
    const analysis = parseAnalysisResult(JSON.stringify(value.analysis));
    const verification = verify(analysis);
    if (!verification.valid) throw new Error(verification.errors.join("; "));
    const attempts = value.attempts.filter(isAttemptArtifact);
    if (attempts.length !== value.attempts.length || attempts.length === 0) {
      throw new Error("invalid attempt history");
    }
    return {
      provider,
      model,
      promptSha256,
      requestSha256,
      attempts,
      analysis,
      verification,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid cached benchmark result at ${path}: ${message}`);
  }
}

function isAttemptArtifact(value: unknown): value is AttemptArtifact {
  return (
    isRecord(value) &&
    isRecord(value.response) &&
    typeof value.costUsd === "number" &&
    Number.isFinite(value.costUsd) &&
    value.costUsd >= 0 &&
    typeof value.latencyMs === "number" &&
    Number.isFinite(value.latencyMs) &&
    value.latencyMs >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function printDryRun(evalCases: EvalCase[], maximumOutputTokens: number): Promise<void> {
  const prompts = await Promise.all(
    evalCases.map((item) =>
      readFile(
        `scratch/evals/${item.id}/${options.promptVersion === "v2" ? "analysis-prompt-v2.md" : "analysis-prompt.md"}`,
        "utf8",
      ),
    ),
  );
  for (const profile of Object.values(PROVIDER_PROFILES)) {
    const maximumUsd = prompts.reduce(
      (sum, prompt) =>
        sum +
        estimateMaximumModelCostUsd(
          maximumInputTokens(prompt),
          maximumOutputTokens,
          profile.pricesUsdPerMillion,
        ),
      0,
    );
    process.stdout.write(
      `${profile.id}: ${evalCases.length} calls, <=${formatUsd(maximumUsd)} at ${maximumOutputTokens} max output tokens each\n`,
    );
  }
  process.stdout.write("Dry run only. Add --execute --provider ID --max-usd N to make paid calls.\n");
}

function parseOptions(args: string[]): Options {
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1] ?? null;
  };
  const promptVersion = value("--prompt-version") ?? "v2";
  if (promptVersion !== "v1" && promptVersion !== "v2") {
    throw new Error("--prompt-version must be v1 or v2");
  }
  return {
    execute: args.includes("--execute"),
    provider: value("--provider"),
    maximumUsd: parseOptionalNumber(value("--max-usd"), "--max-usd"),
    maximumOutputTokens: parsePositiveInteger(value("--max-output") ?? "1200", "--max-output"),
    start: parseInteger(value("--start") ?? "0", "--start"),
    limit: parsePositiveInteger(value("--limit") ?? "15", "--limit"),
    promptVersion,
  };
}

function parsePositiveInteger(value: string, name: string): number {
  const number = parseInteger(value, name);
  if (number < 1) throw new Error(`${name} must be a positive integer`);
  return number;
}

function parseOptionalNumber(value: string | null, name: string): number | null {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a number`);
  return number;
}

function parseInteger(value: string, name: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return number;
}

function formatUsd(value: number): string {
  return `US$${value.toFixed(6)}`;
}

function maximumInputTokens(prompt: string): number {
  // Provider tokenizers operate on bytes; one token cannot consume less than one encoded byte.
  return Buffer.byteLength(prompt, "utf8");
}
