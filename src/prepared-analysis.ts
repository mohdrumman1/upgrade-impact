import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { renderAnalysisMarkdown } from "./analysis-report.ts";
import { parseAnalysisResult, type AnalysisResult } from "./analysis-schema.ts";
import { verifyAnalysisApplicability, type ApplicabilityGraph } from "./applicability.ts";
import {
  calculateModelCostUsd,
  estimateMaximumModelCostUsd,
  type ModelResponse,
} from "./model-process.ts";
import { providerProfile } from "./model-providers.ts";
import { callWithRateLimitBackoff } from "./model-retry.ts";
import type { PreflightFinding } from "./preflight.ts";

export type PreparedAnalysisOptions = {
  promptPath: string;
  graphPath: string;
  preflightPath: string;
  outputPath: string;
  metadataPath?: string;
  provider?: string;
  maximumUsd?: number;
  maximumOutputTokens?: number;
  apiKey?: string;
  notice?: (message: string) => void;
};

export type PreparedAnalysisMetadata = {
  provider: string;
  model: string;
  requestHash: string;
  spendUsd: number;
  attempts: number;
  usage: ModelResponse["usage"][];
  latencyMs: number;
};

export async function analysePrepared(
  options: PreparedAnalysisOptions,
): Promise<PreparedAnalysisMetadata> {
  const maximumUsd = options.maximumUsd ?? 0.02;
  if (!Number.isFinite(maximumUsd) || maximumUsd <= 0 || maximumUsd > 0.05) {
    throw new Error("Maximum report spend must be above zero and at most US$0.05");
  }
  const maximumOutputTokens = options.maximumOutputTokens ?? 1_200;
  if (!Number.isSafeInteger(maximumOutputTokens) || maximumOutputTokens < 1) {
    throw new Error("Maximum output tokens must be a positive integer");
  }
  const profile = providerProfile(options.provider ?? "openrouter-openai-mini");
  const apiKey = options.apiKey ?? process.env[profile.apiKeyEnvironmentVariable];
  if (!apiKey) throw new Error(`Missing ${profile.apiKeyEnvironmentVariable}`);

  const [prompt, graphText, preflightText] = await Promise.all([
    readFile(options.promptPath, "utf8"),
    readFile(options.graphPath, "utf8"),
    readFile(options.preflightPath, "utf8"),
  ]);
  const graph = JSON.parse(graphText) as ApplicabilityGraph;
  const preflight = JSON.parse(preflightText) as { findings?: PreflightFinding[] };
  if (!Array.isArray(preflight.findings)) throw new Error("Invalid preflight artifact");
  const maximumRequestCostUsd = estimateMaximumModelCostUsd(
    Buffer.byteLength(prompt, "utf8"),
    maximumOutputTokens,
    profile.pricesUsdPerMillion,
  );

  let spendUsd = 0;
  let analysis: AnalysisResult | null = null;
  const attempts: Array<{ response: ModelResponse; costUsd: number; latencyMs: number }> = [];
  let lastError = "Model did not return a valid report";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (spendUsd + maximumRequestCostUsd > maximumUsd) {
      throw new Error(
        `Spend cap prevents attempt ${attempt + 1}: worst case US$${(spendUsd + maximumRequestCostUsd).toFixed(6)} exceeds US$${maximumUsd.toFixed(6)}`,
      );
    }
    const startedAt = performance.now();
    try {
      const response = await callWithRateLimitBackoff(
        profile,
        prompt,
        apiKey,
        maximumOutputTokens,
        { notice: (delayMs) => options.notice?.(`Rate limited; resuming in ${delayMs / 1_000}s`) },
      );
      const costUsd = response.chargedCostUsd ??
        calculateModelCostUsd(response.usage, profile.pricesUsdPerMillion);
      attempts.push({ response, costUsd, latencyMs: Math.round(performance.now() - startedAt) });
      spendUsd += costUsd;
      const candidate = parseAnalysisResult(response.content);
      const verification = verifyAnalysisApplicability(candidate, graph);
      if (!verification.valid) throw new Error(verification.errors.join("; "));
      analysis = candidate;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (analysis === null) throw new Error(lastError);

  const metadata: PreparedAnalysisMetadata = {
    provider: profile.id,
    model: profile.model,
    requestHash: createHash("sha256").update(prompt).digest("hex"),
    spendUsd,
    attempts: attempts.length,
    usage: attempts.map((item) => item.response.usage),
    latencyMs: attempts.reduce((sum, item) => sum + item.latencyMs, 0),
  };
  await writeFile(options.outputPath, renderAnalysisMarkdown(analysis, preflight.findings));
  if (options.metadataPath) {
    await writeFile(options.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  }
  return metadata;
}
