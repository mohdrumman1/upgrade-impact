# Cost controls

## Current spend

Recorded model evaluation and production-path verification spend: US$0.464451. AUD conversion and any OpenRouter credit-purchase fee are not included. Two early DeepSeek Pro responses returned empty content before billed-failure capture was fixed, so the exact OpenRouter account total is slightly higher; consult OpenRouter activity before accounting. No hosting, domain, advertising, or other infrastructure spend has been made.

The historical arbitrary-PR integration and owned public Action/comment tests both used deterministic findings and added US$0 model spend. Reports with no applicability edge never call a provider. Cached verified reports also add no model spend.

OpenRouter OpenAI Mini is selected for the public beta report layer. Its graph-v2 run cost US$0.048979 total, or US$0.003265 per report before retry buffer. Applying a 30% retry buffer and a deliberately conservative 2 AUD/USD conversion gives about A$0.0085 per report, far below the A$0.50 gate. A separate end-to-end prepared-report check cost US$0.002486.

The deterministic v2 applicability prompts total about 31,233 estimated tokens across the same cases, 23.4% below v1. The v2 dry-run ceiling is US$0.022526 for DeepSeek Flash, US$0.069992 for DeepSeek Pro, and US$0.174675 for OpenAI Mini across all 15 calls at the current output cap. These are conservative ceilings, not actual spend.

## Provider benchmark

Price snapshot checked 2026-08-10 against official provider documentation. Prices per million tokens:

| Candidate | Uncached input USD | Cached input USD | Output USD | 15-case dry-run maximum USD |
| --- | ---: | ---: | ---: | ---: |
| `deepseek-v4-flash` | 0.14 | 0.0028 | 0.28 | 0.027505 |
| `deepseek-v4-pro` | 0.435 | 0.003625 | 0.87 | 0.085462 |
| `kimi-k2.6` | 0.95 | 0.16 | 4.00 | 0.224441 |
| `gpt-5.4-mini` | 0.75 | 0.075 | 4.50 | 0.201348 |
| `claude-sonnet-4.6` | 3.00 | provider-dependent | 15.00 | 0.751392 |

The benchmark ran through OpenRouter. DeepSeek Flash, DeepSeek Pro, and OpenAI Mini completed; all failed the quality gate. Sonnet 4.6 was stopped after repeated schema/length failures in two prompt variants. The dry-run figures conservatively bound input at one token per UTF-8 byte, assume every case consumes its 1,200-token maximum output, and apply no cache discount.

| Measured candidate | Complete-run cost USD | Mean score | Useful reports | Reports with unsupported material claims | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| OpenRouter DeepSeek Flash | 0.004395 | 7.467/10 | 8/15 | 7/15 | Fail |
| OpenRouter DeepSeek Pro | 0.011421 | 7.400/10 | 8/15 | 5/15 | Fail |
| OpenRouter OpenAI Mini | 0.062487 | 7.400/10 | 9/15 | 5/15 | Fail |
| OpenRouter Claude Sonnet 4.6 | incomplete | not scored | not scored | not scored | Stop after repeated format/schema failures |

Graph-v2 decision:

| Measured candidate | Complete-run cost USD | Mean score | Useful reports | Unsupported material claims | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| OpenRouter DeepSeek Flash | incomplete; 0.002848 recorded | not promoted | below target during run | one verifier-blocked impact | Fail |
| OpenRouter OpenAI Mini | 0.048979 | 9.267/10 | 12/15 combined | 0/15 | Pass |

Sources:

- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/models/gpt-5.4-mini
- https://api-docs.deepseek.com/quick_start/pricing/
- https://platform.kimi.ai/docs/pricing/chat-k26
- https://openrouter.ai/docs/cookbook/administration/usage-accounting
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/anthropic/claude-sonnet-4.6

## Initial A$500 ceiling

- A$120 model evaluation credits
- A$40 domain and email
- A$90 hosting after validation
- A$100 proven distribution experiment after activation exists
- A$100 security/legal/accounting reserve
- A$50 unallocated

## Per-report budget

Target: below A$0.50 including a 30% retry buffer.

Track:

- Input, cached-input, reasoning, and output tokens
- Model and price snapshot
- Release-note fetch count
- Retry count
- Total cost in AUD

Hard limits:

- Maximum one primary model call per report in the MVP
- Maximum two retries for an external operation
- No automatic fallback to a more expensive model
- No paid service without a spend cap and kill switch
