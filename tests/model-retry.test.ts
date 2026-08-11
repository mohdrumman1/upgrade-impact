import assert from "node:assert/strict";
import test from "node:test";
import { callWithRateLimitBackoff } from "../src/model-retry.ts";
import type { ModelResponse, ProviderProfile } from "../src/model-process.ts";

const profile: ProviderProfile = {
  id: "test",
  baseUrl: "https://example.test",
  model: "test-model",
  apiKeyEnvironmentVariable: "TEST_KEY",
  responseMode: "json-object",
  maximumOutputParameter: "max_tokens",
  requestOverrides: {},
  pricesUsdPerMillion: { input: 0, cachedInput: 0, output: 0 },
};

const response: ModelResponse = {
  id: "result",
  content: "{}",
  usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
  chargedCostUsd: 0,
};

test("backs off on 429 and then resumes", async () => {
  let calls = 0;
  const waits: number[] = [];
  const notices: Array<[number, number]> = [];
  const result = await callWithRateLimitBackoff(profile, "prompt", "key", 100, {
    delaysMs: [10, 20],
    call: async () => {
      calls += 1;
      if (calls < 3) throw new Error("Provider request failed with HTTP 429 (429)");
      return response;
    },
    wait: async (delayMs) => { waits.push(delayMs); },
    notice: (delayMs, requestNumber) => { notices.push([delayMs, requestNumber]); },
  });

  assert.equal(result, response);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
  assert.deepEqual(notices, [[10, 2], [20, 3]]);
});

test("does not retry non-rate-limit failures", async () => {
  let calls = 0;
  await assert.rejects(
    callWithRateLimitBackoff(profile, "prompt", "key", 100, {
      call: async () => {
        calls += 1;
        throw new Error("Provider request failed with HTTP 500");
      },
      wait: async () => {},
    }),
    /HTTP 500/,
  );
  assert.equal(calls, 1);
});
