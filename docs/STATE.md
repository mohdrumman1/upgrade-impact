# Current state

Updated: 2026-08-11

## Objective

Build and validate UpgradeImpact, a low-touch Forma AI developer product that posts repository-specific dependency-upgrade reports.

## Current phase

The frozen automated quality gate passed. OpenRouter OpenAI Mini is selected behind graph verification and deterministic preflight. The arbitrary-public-PR pipeline and Action comment adapter now work end to end; dedicated public Action publication and a GitHub-hosted runner check are the active build phase.

## Completed

- Product scope, non-goals, architecture, test gates, cost limits, and security rules recorded.
- TypeScript/npm selected for the first ecosystem.
- Repository uses a small context index plus on-demand documentation.
- Deterministic manifest comparison and Markdown/JSON rendering implemented.
- Fifteen public PR cases acquired into ignored local state: 44 manifests and 52 dependency changes.
- The first candidate benchmark was rejected because it contained unrelated feature work; the replacement is dependency-only.
- One manual Next.js 14-to-15 prototype scored 9/10.
- Model output schema requires bounded fields plus repository and official-release evidence.
- All 15 cases have bounded evidence packs: 26 dependency changes and 105 excerpts.
- Evidence input ranges from about 182 to 2,888 estimated tokens per case.
- Sensitive paths are excluded and likely credentials are redacted before an excerpt leaves the deterministic stage.
- Exact base commits use one-shot shallow snapshots; an interrupted run can safely resume.
- Official npm metadata, package-aware GitHub Releases, and commit-pinned changelogs provide bounded official evidence for 23 of 26 dependency changes.
- Three changelog excerpts cover Rimraf, Storybook Controls, and OpenTelemetry auto-instrumentations without mutable links.
- Three dependencies remain explicitly uncovered: `@actions/github`, `next`, and `@radix-ui/react-switch`.
- Exact analysis prompts are generated as ignored filesystem artifacts with the stable instructions first and dynamic evidence last.
- Package-aware tag filtering rejects named releases belonging to another package in the same monorepo.
- Three Day 3 representative reports cover small, grouped, and evidence-gap cases; all pass schema and citation verification and average 9/10.
- Deterministic verification rejects repository lines and official URLs that were not present in the prepared input.
- Npm executable metadata expands repository searches to official CLI aliases; this recovered Biome and Concurrently command usage without substring guessing.
- Four Day 4 reports add 37/40 points; eight of 15 reports reached a 9.125/10 interim mean.
- All 15 reports are scored at 137/150 points (9.133/10 mean); 12 add repository-specific value and three are safe omissions.
- No unsupported material claim is known, and deterministic schema, prepared-citation, and score validation passes.
- Release selection now preserves target and compatibility-boundary evidence and handles removals in the correct version direction.
- The correction recovered Safe Area Context 5's React Native 0.74 floor and Agents' post-0.13 boundary evidence while keeping the three-excerpt cap.
- Current v1 prompts total about 40,753 estimated input tokens across the frozen cases after adding the missing official Next.js guide.
- A provider-neutral OpenAI-compatible model stage supports DeepSeek Flash/Pro, Kimi K2.6, and pinned GPT-5.4 mini without runtime dependencies.
- Paid execution requires an explicit provider and spend cap, refuses caps above US$1, checks worst-case cost before each attempt, permits at most two attempts, and never falls back automatically.
- Successful results are revalidated and reused from ignored filesystem cache; provider HTTP error bodies and API keys are not logged.
- OpenRouter DeepSeek Flash completed for US$0.004395 but scored 7.467/10 with 8/15 useful and 7/15 containing unsupported material claims.
- OpenRouter DeepSeek Pro completed for US$0.011421 but scored 7.400/10 with 8/15 useful and 5/15 containing unsupported material claims.
- OpenRouter OpenAI Mini completed for US$0.062487 but scored 7.400/10 with 9/15 useful and 5/15 containing unsupported material claims.
- Claude Sonnet 4.6 was stopped after repeated format, length, and missing-evidence failures across two bounded variants.
- Total recorded provider spend is US$0.410138 plus two early unmeasured empty Pro responses; no other business spend was made.
- The process now records provider-billed cost, hashes the exact request for cache validity, accepts only exact fenced JSON as a bounded fallback, and logs only sanitized provider error codes.
- A typed applicability graph now joins release facts to repository usages only through exact concepts; API symbols are package-qualified and each finding can be reverified against its edge.
- A bounded second repository search is directed by actionable unmatched release concepts and excludes inactive/noisy paths.
- Focused regressions pass: Concurrently recovers its real Node engine mismatch without inventing flag usage, OpenTelemetry does not equate `NodeSDK` with unrelated APIs/config, and Agents distinguishes v1/v2 `McpServer` packages while retaining `McpAgent`/SDK compatibility.
- Version constraints compare release minimums with repository Node, React Native, and TypeScript versions using explicit `below-minimum` or `satisfies-minimum` edges.
- Dependency-scope edges require direct repository use and an official statement naming the dependency; specific edges take priority in deterministic drafts.
- A zero-model preflight detects removed dependencies that remain invoked, recovering the Actions/ncc case without misusing release evidence.
- A version-pinned Next.js Markdown guide fallback recovers the only missing official source through a strict allowlist.
- The frozen expectation gate now passes: 11 graph-matched useful cases, one deterministic preflight, three safe omissions, and zero source blockers.
- V2 contains 37 bounded edges and totals about 31,233 estimated prompt tokens versus 40,753 for v1 (23.4% lower).
- Fifteen zero-cost deterministic drafts contain 14 graph-verified findings; these are diagnostic baselines and have not been promoted as customer-facing quality.
- The benchmark harness defaults to v2 prompts, validates model findings against graph edges, and isolates v2 caches from historical v1 artifacts.
- DeepSeek Flash v2 was rejected after missed useful findings and a directionally incorrect impact was blocked by graph verification; US$0.002848 was recorded across its partial run.
- OpenRouter OpenAI Mini v2 completed all 15 cases for US$0.048979 and passed at 9.267/10 mean, 12 useful combined reports, and zero unsupported material claims.
- OpenAI Mini is selected for public beta synthesis; the measured buffered cost is about A$0.0085/report using a deliberately conservative 2 AUD/USD conversion.
- A production-shaped `pnpm analyse` command accepts prepared prompt, graph, and preflight artifacts; enforces a US$0.02 default and US$0.05 absolute per-report cap; performs bounded 429 backoff and at most two model attempts; graph-verifies output; merges deterministic findings; and records usage, cost, and latency.
- An end-to-end prepared Next.js report passed for US$0.002486. The session key was process-only and was not persisted.
- Strict TypeScript checking and 62 tests pass.
- A low-touch revenue path and dated launch gates are recorded in `docs/GO_TO_MARKET.md`.
- Arbitrary public npm pull requests now run through one idempotent acquire, prepare, analyse, verify, render, and comment pipeline.
- Run state is keyed by repository, PR number, exact base SHA, and exact head SHA; deterministic, evidence, release, graph, prompt, preflight, report, and model metadata artifacts resume safely.
- The Action validates public-only events, reads untrusted manifests through the GitHub API, and searches a bare immutable base snapshot without checking out or executing PR code.
- No-edge reports skip the provider entirely. Model-backed reports retain the selected OpenAI Mini profile, US$0.02 default cap, US$0.05 absolute cap, two attempts, and graph verification.
- One marker-owned PR comment is created or updated; GitHub and provider failures omit response bodies and credentials.
- Historical public PR `fr12k/terraform-monorepo-action#138` completed, found retained `@vercel/ncc`, spent US$0, and reused its report on rerun.
- Owned public fixture `mohdrumman1/upgrade-impact-action-test#1` completed through the actual Action entry point; rerun reused the report, updated the same comment, and left exactly one comment.

## In progress

- Publish a sanitized snapshot to a dedicated public Action repository with an immutable beta tag.
- Run the Action on GitHub-hosted infrastructure against the owned public fixture.
- Prepare Marketplace metadata only after the hosted run passes.

## Next action

Create the dedicated public beta Action repository from the verified private development snapshot, run it on the owned fixture with GitHub-hosted Actions, then prepare Marketplace publication without changing the selected graph, prompt, or model.

## Open decision

Private excerpt handling, retention, hosted billing, and Marketplace publication remain deferred until the GitHub-hosted public Action passes end to end.

## Resume instructions

```bash
cd /Users/rumman/forma-upgrade-impact
git status --short --branch
sed -n '1,220p' docs/STATE.md
sed -n '1,220p' docs/PLAN.yaml
pnpm check
pnpm eval:evidence --start 0 --limit 15
pnpm eval:releases
pnpm eval:inputs
pnpm eval:applicability
pnpm eval:drafts
pnpm eval:validate
pnpm eval:models
pnpm eval:models:validate -- evals/openrouter-deepseek-flash-scores.json
pnpm eval:models:validate -- evals/openrouter-deepseek-pro-scores.json
pnpm eval:models:validate -- evals/openrouter-openai-mini-scores.json
pnpm eval:models:validate -- evals/openrouter-openai-mini-v2-scores.json
```

Then execute the `next_action` in `docs/PLAN.yaml`; paid-run details are in `docs/MODEL_BENCHMARK.md`. Do not store API keys in the repository or documentation. Do not start private-repository or billing infrastructure until the public Action passes end to end.
