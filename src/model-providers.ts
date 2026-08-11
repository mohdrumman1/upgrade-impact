import type { ProviderProfile } from "./model-process.ts";

export const PROVIDER_PROFILES = {
  "openrouter-deepseek-flash": {
    id: "openrouter-deepseek-flash",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "deepseek/deepseek-v4-flash",
    apiKeyEnvironmentVariable: "OPENROUTER_API_KEY",
    responseMode: "json-schema",
    maximumOutputParameter: "max_tokens",
    requestOverrides: {
      provider: {
        sort: "price",
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: true,
        max_price: { prompt: 0.14, completion: 0.28 },
      },
    },
    pricesUsdPerMillion: { input: 0.14, cachedInput: 0.14, output: 0.28 },
  },
  "openrouter-deepseek-pro": {
    id: "openrouter-deepseek-pro",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "deepseek/deepseek-v4-pro",
    apiKeyEnvironmentVariable: "OPENROUTER_API_KEY",
    responseMode: "json-schema",
    maximumOutputParameter: "max_tokens",
    requestOverrides: {
      reasoning: { effort: "none" },
      provider: {
        sort: "price",
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        max_price: { prompt: 0.435, completion: 0.87 },
      },
    },
    pricesUsdPerMillion: { input: 0.435, cachedInput: 0.435, output: 0.87 },
  },
  "openrouter-openai-mini": {
    id: "openrouter-openai-mini",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-5.4-mini",
    apiKeyEnvironmentVariable: "OPENROUTER_API_KEY",
    responseMode: "json-schema",
    maximumOutputParameter: "max_completion_tokens",
    requestOverrides: {
      reasoning: { effort: "none" },
      provider: {
        sort: "price",
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: true,
        max_price: { prompt: 0.75, completion: 4.5 },
      },
    },
    pricesUsdPerMillion: { input: 0.75, cachedInput: 0.75, output: 4.5 },
  },
  "openrouter-claude-sonnet": {
    id: "openrouter-claude-sonnet",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4.6",
    apiKeyEnvironmentVariable: "OPENROUTER_API_KEY",
    responseMode: "json-object",
    maximumOutputParameter: "max_tokens",
    requestOverrides: {
      verbosity: "low",
      provider: {
        sort: "price",
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        max_price: { prompt: 3, completion: 15 },
      },
    },
    pricesUsdPerMillion: { input: 3, cachedInput: 3, output: 15 },
  },
  "deepseek-flash": {
    id: "deepseek-flash",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    apiKeyEnvironmentVariable: "DEEPSEEK_API_KEY",
    responseMode: "json-object",
    maximumOutputParameter: "max_tokens",
    requestOverrides: { thinking: { type: "disabled" } },
    pricesUsdPerMillion: { input: 0.14, cachedInput: 0.0028, output: 0.28 },
  },
  "deepseek-pro": {
    id: "deepseek-pro",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    apiKeyEnvironmentVariable: "DEEPSEEK_API_KEY",
    responseMode: "json-object",
    maximumOutputParameter: "max_tokens",
    requestOverrides: { thinking: { type: "disabled" } },
    pricesUsdPerMillion: { input: 0.435, cachedInput: 0.003625, output: 0.87 },
  },
  "kimi-k2.6": {
    id: "kimi-k2.6",
    baseUrl: "https://api.moonshot.ai/v1",
    model: "kimi-k2.6",
    apiKeyEnvironmentVariable: "MOONSHOT_API_KEY",
    responseMode: "json-object",
    maximumOutputParameter: "max_completion_tokens",
    requestOverrides: { thinking: { type: "disabled" } },
    pricesUsdPerMillion: { input: 0.95, cachedInput: 0.16, output: 4 },
  },
  "openai-mini": {
    id: "openai-mini",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.4-mini-2026-03-17",
    apiKeyEnvironmentVariable: "OPENAI_API_KEY",
    responseMode: "json-schema",
    maximumOutputParameter: "max_completion_tokens",
    requestOverrides: { reasoning_effort: "none" },
    pricesUsdPerMillion: { input: 0.75, cachedInput: 0.075, output: 4.5 },
  },
} as const satisfies Record<string, ProviderProfile>;

export type ProviderId = keyof typeof PROVIDER_PROFILES;

export function providerProfile(id: string): ProviderProfile {
  if (!(id in PROVIDER_PROFILES)) {
    throw new Error(`Unknown provider: ${id}`);
  }
  return PROVIDER_PROFILES[id as ProviderId];
}
