import {
  callChatCompletion,
  type ModelResponse,
  type ProviderProfile,
} from "./model-process.ts";

export type RetryNotice = (delayMs: number, requestNumber: number) => void;

export async function callWithRateLimitBackoff(
  profile: ProviderProfile,
  prompt: string,
  apiKey: string,
  maximumOutputTokens: number,
  options: {
    delaysMs?: readonly number[];
    notice?: RetryNotice;
    call?: typeof callChatCompletion;
    wait?: (delayMs: number) => Promise<void>;
  } = {},
): Promise<ModelResponse> {
  const delaysMs = options.delaysMs ?? [15_000, 45_000];
  const call = options.call ?? callChatCompletion;
  const wait = options.wait ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  for (let request = 0; ; request += 1) {
    try {
      return await call(profile, prompt, apiKey, maximumOutputTokens);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("HTTP 429") || request >= delaysMs.length) throw error;
      const delayMs = delaysMs[request]!;
      options.notice?.(delayMs, request + 2);
      await wait(delayMs);
    }
  }
}
