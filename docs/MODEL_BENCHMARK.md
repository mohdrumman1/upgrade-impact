# Model benchmark runbook

The benchmark uses the frozen 15 public-repository prompts. It defaults to graph-v2 prompts and verifies that every model finding resolves through a deterministic applicability edge. It records provider-reported usage and latency and caches successful results under a versioned ignored path so reruns do not repeat paid calls. Historical v1 artifacts remain separate.

## Safe preview

```bash
pnpm eval:models
```

This makes no network calls and prints a conservative preflight ceiling for every configured provider. Input is bounded at one token per UTF-8 byte rather than relying on the looser four-characters-per-token display estimate.

## Paid runs

Set `OPENROUTER_API_KEY` through the shell or a secret manager, then run:

```bash
pnpm eval:models -- --execute --provider openrouter-deepseek-flash --max-usd 0.03
```

Do not put the key directly in documentation or commit it to a file. The executable refuses paid mode without both a provider and a positive spend cap, caps the cap itself at US$1, checks worst-case cost before every attempt, allows at most two model attempts, backs off twice on HTTP 429 without counting unbilled throttles as model attempts, and never falls back to another provider.

Available direct and OpenRouter provider IDs are defined in `src/model-providers.ts`. Use `--start N --limit N` for a bounded subset and `--max-output N` only when deliberately changing the frozen output allowance.

V2 is the default. `--prompt-version v1` exists only to reproduce historical behavior; do not use it for a new provider decision. V2 results are cached below `scratch/benchmarks/{provider}/v2/` and are scored separately from v1.

## Quality decision

OpenRouter OpenAI Mini is promoted for the public beta report layer after graph v2 passed at 9.267/10, 12/15 useful combined reports, zero unsupported material claims, and US$0.048979 total. DeepSeek Flash remains rejected. Every prompt or graph change must rerun the same gate.

Scorecard validation:

```bash
pnpm eval:models:validate -- evals/openrouter-deepseek-flash-scores.json
pnpm eval:models:validate -- evals/openrouter-deepseek-pro-scores.json
pnpm eval:models:validate -- evals/openrouter-openai-mini-scores.json
pnpm eval:models:validate -- evals/openrouter-openai-mini-v2-scores.json
```
