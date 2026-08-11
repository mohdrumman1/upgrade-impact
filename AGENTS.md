# UpgradeImpact agent index

Keep this file small and stable. Load deeper context only when the task needs it.

## Start every session

1. Read `docs/STATE.md` for the exact current state and next action.
2. Read `docs/PLAN.yaml` for task status and validation gates.
3. Run `git status --short --branch` before editing.
4. Run `pnpm check` before declaring code complete.

## Load on demand

- Product scope and non-goals: `docs/PRODUCT.md`
- Pipeline and state model: `docs/ARCHITECTURE.md`
- Decisions and reasons: `docs/DECISIONS.md`
- Test strategy and eval gates: `docs/TESTING.md`
- Spend limits and unit economics: `docs/COSTS.md`
- Data handling and permissions: `docs/SECURITY.md`
- Revenue path and launch gates: `docs/GO_TO_MARKET.md`
- Provider benchmark operation: `docs/MODEL_BENCHMARK.md`

## Hard constraints

- Validate the report manually before building hosted infrastructure.
- Deterministic code extracts facts; a model may synthesize but cannot invent evidence.
- Every user-visible claim must cite an official release note or an existing repository path.
- Never modify customer code in the MVP.
- Do not add LangGraph, a database, a web dashboard, or multi-agent orchestration without evidence that the simple pipeline cannot cope.
- Never commit secrets, raw private source, or large tool output.
- Store large local research/eval output under ignored `scratch/` and summarize decisions in `docs/`.
- Keep prompts stable-prefix-first and put dynamic repository content last.
- Paid infrastructure requires a recorded decision in `docs/DECISIONS.md`.

## Working style

- One bounded change at a time.
- Prefer Node built-ins and zero-runtime-dependency code.
- Update `docs/STATE.md` whenever the next action changes.
- Add a decision record when changing scope, architecture, privacy, pricing, or spend.
