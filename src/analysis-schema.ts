export type Risk = "low" | "medium" | "high" | "unknown";

export type AnalysisFinding = {
  title: string;
  impact: string;
  repositoryEvidence: string[];
  releaseEvidence: string[];
  recommendedChecks: string[];
};

export type AnalysisResult = {
  risk: Risk;
  confidence: number;
  summary: string;
  findings: AnalysisFinding[];
  omittedConcerns: string[];
};

const RISKS = new Set<Risk>(["low", "medium", "high", "unknown"]);

export function parseAnalysisResult(input: string): AnalysisResult {
  let value: unknown;
  try {
    value = JSON.parse(stripSingleJsonFence(input));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid analysis JSON: ${message}`);
  }

  if (!isRecord(value)) throw new Error("Invalid analysis: expected an object");
  if (typeof value.risk !== "string" || !RISKS.has(value.risk as Risk)) {
    throw new Error("Invalid analysis: unsupported risk");
  }
  if (
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  ) {
    throw new Error("Invalid analysis: confidence must be between 0 and 1");
  }
  assertBoundedString(value.summary, "summary", 400);
  const findings = assertArray(value.findings, "findings", 8).map((finding, index) =>
    parseFinding(finding, index),
  );
  const omittedConcerns = parseStringArray(
    value.omittedConcerns,
    "omittedConcerns",
    8,
    400,
  );

  return {
    risk: value.risk as Risk,
    confidence: value.confidence,
    summary: value.summary,
    findings,
    omittedConcerns,
  };
}

function stripSingleJsonFence(input: string): string {
  const trimmed = input.trim();
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return match?.[1] ?? input;
}

function parseFinding(value: unknown, index: number): AnalysisFinding {
  if (!isRecord(value)) throw new Error(`Invalid finding ${index}: expected an object`);
  assertBoundedString(value.title, `findings[${index}].title`, 120);
  assertBoundedString(value.impact, `findings[${index}].impact`, 600);
  const repositoryEvidence = parseStringArray(
    value.repositoryEvidence,
    `findings[${index}].repositoryEvidence`,
    8,
    300,
  );
  const releaseEvidence = parseStringArray(
    value.releaseEvidence,
    `findings[${index}].releaseEvidence`,
    8,
    500,
  );
  const recommendedChecks = parseStringArray(
    value.recommendedChecks,
    `findings[${index}].recommendedChecks`,
    8,
    400,
  );
  if (repositoryEvidence.length === 0 || releaseEvidence.length === 0) {
    throw new Error(`Invalid finding ${index}: both evidence lists are required`);
  }
  if (!releaseEvidence.every(isHttpUrl)) {
    throw new Error(`Invalid finding ${index}: release evidence must be HTTP URLs`);
  }

  return {
    title: value.title,
    impact: value.impact,
    repositoryEvidence,
    releaseEvidence,
    recommendedChecks,
  };
}

function parseStringArray(
  value: unknown,
  name: string,
  maxItems: number,
  maxLength: number,
): string[] {
  const items = assertArray(value, name, maxItems);
  for (const [index, item] of items.entries()) {
    assertBoundedString(item, `${name}[${index}]`, maxLength);
  }
  return items as string[];
}

function assertArray(value: unknown, name: string, maxItems: number): unknown[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`Invalid analysis: ${name} must be an array with at most ${maxItems} items`);
  }
  return value;
}

function assertBoundedString(
  value: unknown,
  name: string,
  maxLength: number,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new Error(`Invalid analysis: ${name} must be 1-${maxLength} characters`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
