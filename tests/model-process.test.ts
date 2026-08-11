import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatCompletionRequest,
  calculateModelCostUsd,
  callChatCompletion,
  estimateMaximumModelCostUsd,
  parseChatCompletionResponse,
} from "../src/model-process.ts";
import { providerProfile } from "../src/model-providers.ts";

test("builds provider-specific structured response requests", () => {
  const deepseek = buildChatCompletionRequest(providerProfile("deepseek-flash"), "json please", 800);
  assert.deepEqual(deepseek.response_format, { type: "json_object" });
  assert.deepEqual(deepseek.thinking, { type: "disabled" });
  assert.equal(deepseek.max_tokens, 800);
  assert.equal(deepseek.max_completion_tokens, undefined);

  const openai = buildChatCompletionRequest(providerProfile("openai-mini"), "json please", 800);
  assert.equal((openai.response_format as { type: string }).type, "json_schema");
  assert.equal(openai.reasoning_effort, "none");
  assert.equal(openai.max_completion_tokens, 800);
});

test("parses portable and provider-specific usage fields", () => {
  const response = parseChatCompletionResponse({
    id: "result-1",
    choices: [{ message: { content: "{\"risk\":\"low\"}" } }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 20,
      prompt_cache_hit_tokens: 60,
      prompt_tokens_details: { cached_tokens: 50 },
      completion_tokens_details: { reasoning_tokens: 7 },
    },
  });
  assert.deepEqual(response.usage, {
    inputTokens: 100,
    cachedInputTokens: 60,
    outputTokens: 20,
    reasoningTokens: 7,
  });
  assert.equal(response.chargedCostUsd, null);
  assert.equal(
    parseChatCompletionResponse({
      choices: [{ message: { content: "{}" } }],
      usage: { cost: 0.000123 },
    }).chargedCostUsd,
    0.000123,
  );
});

test("preserves empty content so billed failures can be recorded", () => {
  const response = parseChatCompletionResponse({
    choices: [{ message: { content: "" } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.001 },
  });
  assert.equal(response.content, "");
  assert.equal(response.chargedCostUsd, 0.001);
});

test("calculates cached and maximum costs", () => {
  const prices = { input: 1, cachedInput: 0.1, output: 2 };
  assert.equal(
    calculateModelCostUsd(
      { inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 100_000, reasoningTokens: 0 },
      prices,
    ),
    0.84,
  );
  assert.equal(estimateMaximumModelCostUsd(1_000, 500, prices), 0.002);
});

test("calls the compatible endpoint without leaking provider error bodies", async () => {
  let authorization = "";
  const fetchImplementation = async (_input: string | URL | Request, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response("secret diagnostic", { status: 500 });
  };
  await assert.rejects(
    callChatCompletion(
      providerProfile("deepseek-flash"),
      "json prompt",
      "private-key",
      100,
      fetchImplementation,
    ),
    (error: Error) => error.message === "Provider request failed with HTTP 500",
  );
  assert.equal(authorization, "Bearer private-key");
});

test("includes only a sanitized provider error code", async () => {
  const fetchImplementation = async () =>
    Response.json(
      { error: { code: "invalid_request", message: "request and secret diagnostic" } },
      { status: 400 },
    );
  await assert.rejects(
    callChatCompletion(
      providerProfile("openrouter-deepseek-flash"),
      "json prompt",
      "private-key",
      100,
      fetchImplementation,
    ),
    (error: Error) => error.message === "Provider request failed with HTTP 400 (invalid_request)",
  );
});
