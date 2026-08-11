export type ResponseMode = "json-object" | "json-schema";

export type ProviderProfile = {
  id: string;
  baseUrl: string;
  model: string;
  apiKeyEnvironmentVariable: string;
  responseMode: ResponseMode;
  maximumOutputParameter: "max_tokens" | "max_completion_tokens";
  requestOverrides: Record<string, unknown>;
  pricesUsdPerMillion: {
    input: number;
    cachedInput: number;
    output: number;
  };
};

export type ModelUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export type ModelResponse = {
  id: string | null;
  content: string;
  usage: ModelUsage;
  chargedCostUsd: number | null;
};

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["risk", "confidence", "summary", "findings", "omittedConcerns"],
  properties: {
    risk: { type: "string", enum: ["low", "medium", "high", "unknown"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: { type: "string", minLength: 1, maxLength: 400 },
    findings: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "impact",
          "repositoryEvidence",
          "releaseEvidence",
          "recommendedChecks",
        ],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 120 },
          impact: { type: "string", minLength: 1, maxLength: 600 },
          repositoryEvidence: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string", minLength: 1, maxLength: 300 },
          },
          releaseEvidence: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string", minLength: 1, maxLength: 500 },
          },
          recommendedChecks: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 1, maxLength: 400 },
          },
        },
      },
    },
    omittedConcerns: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 400 },
    },
  },
} as const;

export function buildChatCompletionRequest(
  profile: ProviderProfile,
  prompt: string,
  maximumOutputTokens: number,
): Record<string, unknown> {
  if (prompt.length === 0) throw new Error("Prompt must not be empty");
  if (!Number.isInteger(maximumOutputTokens) || maximumOutputTokens < 1) {
    throw new Error("Maximum output tokens must be a positive integer");
  }

  const responseFormat =
    profile.responseMode === "json-schema"
      ? {
          type: "json_schema",
          json_schema: {
            name: "upgrade_impact_analysis",
            strict: true,
            schema: ANALYSIS_JSON_SCHEMA,
          },
        }
      : { type: "json_object" };

  return {
    model: profile.model,
    messages: [{ role: "user", content: prompt }],
    response_format: responseFormat,
    [profile.maximumOutputParameter]: maximumOutputTokens,
    stream: false,
    ...profile.requestOverrides,
  };
}

export async function callChatCompletion(
  profile: ProviderProfile,
  prompt: string,
  apiKey: string,
  maximumOutputTokens: number,
  fetchImplementation: FetchLike = fetch,
): Promise<ModelResponse> {
  if (apiKey.length === 0) throw new Error(`Missing ${profile.apiKeyEnvironmentVariable}`);
  const response = await fetchImplementation(`${profile.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(buildChatCompletionRequest(profile, prompt, maximumOutputTokens)),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const providerCode = await safeProviderErrorCode(response);
    throw new Error(
      `Provider request failed with HTTP ${response.status}${providerCode ? ` (${providerCode})` : ""}`,
    );
  }
  return parseChatCompletionResponse(await response.json());
}

async function safeProviderErrorCode(response: Response): Promise<string | null> {
  try {
    const value = (await response.json()) as unknown;
    if (!isRecord(value) || !isRecord(value.error)) return null;
    const code = value.error.code;
    const text = typeof code === "string" || typeof code === "number" ? String(code) : "";
    return /^[A-Za-z0-9_.-]{1,80}$/.test(text) ? text : null;
  } catch {
    return null;
  }
}

export function parseChatCompletionResponse(value: unknown): ModelResponse {
  if (!isRecord(value)) throw new Error("Invalid provider response: expected an object");
  const choices = value.choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message = isRecord(first) && isRecord(first.message) ? first.message : null;
  if (message === null || (typeof message.content !== "string" && message.content !== null)) {
    throw new Error("Invalid provider response: missing model message");
  }
  const usage = isRecord(value.usage) ? value.usage : {};
  const promptDetails = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
  const completionDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : {};
  const inputTokens = nonNegativeInteger(usage.prompt_tokens);
  const cachedInputTokens = Math.min(
    inputTokens,
    Math.max(
      nonNegativeInteger(promptDetails.cached_tokens),
      nonNegativeInteger(usage.prompt_cache_hit_tokens),
    ),
  );

  return {
    id: typeof value.id === "string" ? value.id : null,
    content: message.content ?? "",
    usage: {
      inputTokens,
      cachedInputTokens,
      outputTokens: nonNegativeInteger(usage.completion_tokens),
      reasoningTokens: nonNegativeInteger(completionDetails.reasoning_tokens),
    },
    chargedCostUsd: nonNegativeNumber(usage.cost),
  };
}

export function calculateModelCostUsd(
  usage: ModelUsage,
  prices: ProviderProfile["pricesUsdPerMillion"],
): number {
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    uncachedInput * prices.input +
    usage.cachedInputTokens * prices.cachedInput +
    usage.outputTokens * prices.output
  ) / 1_000_000;
}

export function estimateMaximumModelCostUsd(
  estimatedInputTokens: number,
  maximumOutputTokens: number,
  prices: ProviderProfile["pricesUsdPerMillion"],
): number {
  return calculateModelCostUsd(
    {
      inputTokens: Math.max(0, Math.ceil(estimatedInputTokens)),
      cachedInputTokens: 0,
      outputTokens: Math.max(0, Math.ceil(maximumOutputTokens)),
      reasoningTokens: 0,
    },
    prices,
  );
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
