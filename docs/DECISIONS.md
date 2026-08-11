# Decisions

## D-001: Start with npm/TypeScript

Date: 2026-08-06

Reason: shortest path to a GitHub Action, large Dependabot/Renovate surface, and current local Node tooling. Python remains a later ecosystem.

## D-002: Validate before infrastructure

Date: 2026-08-06

No database, dashboard, hosted worker, or paid API is created until the historical-PR eval passes. This preserves the A$500 budget and prevents automating a weak output.

## D-003: Deterministic facts, model synthesis

Date: 2026-08-06

Version extraction, repository search, citation checks, and rendering remain deterministic. A model may classify and explain only the evidence it receives.

## D-004: Single pipeline, no agent swarm

Date: 2026-08-06

The task fits a staged pipeline. Multi-agent coordination would add token cost and failure modes without a context-isolation need.

## D-005: Files are the durable handoff

Date: 2026-08-06

`AGENTS.md` is the small entry point. `docs/STATE.md` and `docs/PLAN.yaml` hold current state. Detailed context is loaded only when relevant. Large outputs are kept in ignored `scratch/`.

## D-006: Benchmark PRs must be dependency-only

Date: 2026-08-06

A Dependabot title is insufficient evidence. The first selected case contained 98 unrelated changed files and was replaced. Benchmark acquisition must inspect the actual file list and reject unrelated feature work before model scoring.

## D-007: Hosted minimal-snippet processing for the paid product

Date: 2026-08-06

The user selected the recommended hosted design. The service will extract small package-relevant excerpts, redact likely secrets, avoid raw private-source logs, and send only the evidence pack to the model. Public repositories remain the only input during validation. Runner-local processing may be offered later if paying customers require it.

## D-008: Official release evidence is deterministic

Date: 2026-08-06

Resolve a package's GitHub repository from official npm metadata, then select only package-compatible GitHub Releases inside the dependency version range. Named monorepo tags belonging to another package are rejected. Bound each release excerpt to 2,400 characters and three releases per dependency. When Releases are absent, inspect only `CHANGELOG.md` and `RELEASES.md` at the npm version's immutable Git commit, including the npm repository directory. Packages without suitable immutable evidence remain explicitly uncovered.

## D-009: Free Action first, external self-serve billing second

Date: 2026-08-09

After validation, publish a dedicated free GitHub Action for public repositories to gain organic Marketplace discovery. Monetize private-repository hosted analysis initially through Stripe-hosted subscription checkout and customer self-service. Do not wait for a paid GitHub Marketplace App listing: GitHub currently expects a verified organization and at least 100 GitHub App installations for paid apps. Add a paid Marketplace plan later when eligible.

## D-010: Search official npm executable aliases

Date: 2026-08-09

Repository evidence search includes the dependency name plus at most three executable names from the target npm version's official `bin` metadata. This finds scoped-package and alias invocations such as `@biomejs/biome` through `biome` and `concurrently` through `conc` without guessing substrings. The same path, noise, deduplication, and excerpt bounds apply.

## D-011: Preserve compatibility-boundary release evidence

Date: 2026-08-10

Within the existing three-excerpt limit, release selection keeps the target release, the first available release in a crossed major (or post-boundary minor for 0.x), then the newest remaining release. Removed packages select evidence at or below the removed version. This avoids spending the fixed evidence budget on adjacent target patches while omitting the migration boundary.

## D-012: Benchmark GPT-5.4 mini before cheaper challengers

Date: 2026-08-10

Use the pinned `gpt-5.4-mini-2026-03-17` snapshot for the first paid frozen-eval run. It supports structured output and is priced for high-volume work, while this task requires synthesis rather than simple extraction. Do not promote `gpt-5.4-nano-2026-03-17` solely on price; benchmark it later only if the mini baseline passes. No production provider is final until actual quality, usage, retry, and AUD cost are measured.

## D-013: Lead with DeepSeek Flash through a provider-neutral harness

Date: 2026-08-10

Supersedes D-012's benchmark order, but keeps its quality-first rule and pinned OpenAI reference. The user approved moving forward with the lower-cost recommendation. Run DeepSeek V4 Flash first against the unchanged 15-case gate, then DeepSeek V4 Pro and pinned GPT-5.4 mini only if needed; Kimi K2.6 remains optional. Use one OpenAI-compatible process stage with explicit provider profiles, no SDK dependency, no automatic fallback, a required per-run spend cap, and cached successful results. This approves public-data evaluation only and does not select a production provider or approve private-source processing.

## D-014: No benchmarked provider passes unattended quality

Date: 2026-08-10

OpenRouter DeepSeek Flash, DeepSeek Pro, and OpenAI Mini all completed the frozen set but scored below 8/10, produced fewer than 12 genuinely useful reports, and exceeded the 5% unsupported-claim limit. Claude Sonnet 4.6 was stopped after repeated output-contract failures across two bounded prompt variants. Do not promote a model, build hosted infrastructure, or expose reports to customers. The next experiment is architectural: represent release facts and repository usages as typed nodes, create deterministic applicability edges only when their concepts match, and ask a model to verbalize only the resulting subgraph. The manual 9.133/10 reports remain the quality target.

## D-015: Keep the graph deterministic and delay another model run

Date: 2026-08-10

Use package-qualified API symbols, exact typed edges, bounded concept-directed repository search, and edge-aware output verification. Preserve v1 artifacts for benchmark reproducibility and write v2 artifacts alongside them. The focused false-positive regressions pass and v2 is smaller, but only three frozen cases currently contain matched subgraphs. Do not spend on another provider until deterministic graph recall covers the useful manual cases without weakening the Concurrently, OpenTelemetry, or Agents regressions. The next graph extension should represent version constraints, commands, manifest relationships, and dependency-owned release scope; it must not add a framework, database, or hosted service.

## D-016: Separate deterministic findings from model synthesis

Date: 2026-08-10

Version constraints and removed-but-still-referenced dependencies are deterministic facts and must not be delegated to a model. Dependency-scope edges may support only targeted verification checks; specific API/config/constraint edges take priority. Add a narrowly allowlisted, version-pinned official-documentation fallback only where the package's established release channel lacks usable GitHub Releases, initially Next.js major upgrade guides. Graph coverage must reproduce the 12 useful/manual outcomes and three safe omissions before another paid run. The next paid evaluation, after credential rotation, uses v2 prompts and graph-aware verification; v1 artifacts remain isolated for historical scorecard validation.

## D-017: Promote OpenAI Mini behind graph verification

Date: 2026-08-10

Graph-v2 OpenRouter OpenAI Mini passes the frozen gate at 9.267/10, 12/15 useful combined reports, zero unsupported material claims, and US$0.048979 for 15 reports. DeepSeek Flash v2 is rejected after omitted useful findings and a directionally incorrect impact blocked by applicability verification. Use `openai/gpt-5.4-mini` through the provider-neutral OpenRouter profile for the public beta report layer. Keep one provider per run, a US$0.02 default per-report cap, a US$0.05 absolute cap, two model attempts at most, deterministic preflight merging, graph verification, and bounded HTTP 429 backoff. A prompt, graph, or model change reopens the frozen quality gate.

## D-018: Use a non-executing pull_request_target Action boundary

Date: 2026-08-11

Use `pull_request_target` so the trusted base workflow can access a model secret and update one PR comment, including for public fork PRs. Never check out or execute the PR head. Acquire changed manifests through the GitHub API as bounded text and search only the immutable base commit in a bare Git repository. Key filesystem state by repository, pull request, exact base SHA, and exact head SHA; cache every completed stage and upsert one marker-owned comment. Public repositories only remain a hard beta constraint. This design follows GitHub's documented requirement that privileged target workflows must not run untrusted PR code.
