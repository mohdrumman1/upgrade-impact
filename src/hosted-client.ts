import { parseAnalysisResult, type AnalysisResult } from "./analysis-schema.ts";
import type { ApplicabilityAnalysisInput, ApplicabilityGraph } from "./applicability.ts";
import { verifyAnalysisApplicability } from "./applicability.ts";
import type { PreparedAnalysisMetadata } from "./prepared-analysis.ts";

export async function requestHostedAnalysis(options: {
  endpoint: string;
  token: string;
  requestId: string;
  analysisInput: ApplicabilityAnalysisInput;
  graph: ApplicabilityGraph;
  fetch?: typeof fetch;
}): Promise<{ analysis: AnalysisResult; metadata: PreparedAnalysisMetadata }> {
  const endpoint = hostedAnalysisUrl(options.endpoint);
  if (options.token.length < 32 || options.token.length > 256) throw new Error("Invalid UpgradeImpact license key");
  const response = await (options.fetch ?? fetch)(endpoint, {
    method: "POST",
    headers: { accept: "application/json", authorization: `Bearer ${options.token}`, "content-type": "application/json" },
    body: JSON.stringify({ version: 1, requestId: options.requestId, analysisInput: options.analysisInput, graph: options.graph }),
    signal: AbortSignal.timeout(150_000),
  });
  if (!response.ok) throw new Error(`Hosted analysis failed with HTTP ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 256_000) throw new Error("Hosted analysis response is too large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 256_000) throw new Error("Hosted analysis response is too large");
  const payload: unknown = JSON.parse(text);
  if (!isRecord(payload) || payload.version !== 1) throw new Error("Hosted analysis returned an invalid response");
  const analysis = parseAnalysisResult(JSON.stringify(payload.analysis));
  if (!verifyAnalysisApplicability(analysis, options.graph).valid) {
    throw new Error("Hosted analysis failed local evidence verification");
  }
  return { analysis, metadata: parseMetadata(payload.metadata) };
}

function hostedAnalysisUrl(value: string): string {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("Hosted endpoint must use HTTPS");
  url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/analyse`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function parseMetadata(value: unknown): PreparedAnalysisMetadata {
  if (!isRecord(value) || typeof value.provider !== "string" || typeof value.model !== "string" ||
    typeof value.requestHash !== "string" || typeof value.spendUsd !== "number" || !Number.isFinite(value.spendUsd) ||
    value.spendUsd < 0 || typeof value.attempts !== "number" || !Number.isSafeInteger(value.attempts) ||
    typeof value.latencyMs !== "number" || !Number.isFinite(value.latencyMs) || !Array.isArray(value.usage)) {
    throw new Error("Hosted analysis returned invalid metadata");
  }
  return value as PreparedAnalysisMetadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
