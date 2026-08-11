# Testing and evaluation

## Fast code gate

```bash
pnpm check
```

This runs strict TypeScript checking and Node's built-in test runner.

## Deterministic test coverage

- Dependency sections: production, development, peer, optional
- Added and removed packages
- Upgrade and downgrade detection
- Range-only changes
- Common semver prefixes
- Unsupported/non-semver versions
- Stable sort order
- Markdown escaping and empty results
- Invalid manifest input
- Git-grep parsing and unsafe-path rejection
- Evidence prioritisation, per-file deduplication, and excerpt bounds
- Package-reference noise filtering
- Sensitive-path exclusion and likely-secret redaction
- npm GitHub repository metadata normalisation
- Version-range release selection, URL validation, and text bounds
- Target and compatibility-boundary retention for major and 0.x upgrades
- Correct release range direction for dependency removals
- Package-aware monorepo release-tag filtering
- Changelog path allowlisting, immutable URLs, version-section extraction, and bounds
- Stable-prefix analysis prompt rendering and transparent token estimation
- Prepared-input citation verification for repository lines and official URLs
- Official npm executable-alias normalisation and bounds
- Provider-specific structured request construction
- Portable usage parsing, cached-token costing, and maximum-cost estimation
- Provider HTTP failure handling without response-body leakage
- Sanitized provider error codes and exact fenced-JSON normalization
- Typed release-fact and repository-usage extraction
- Package-qualified API-symbol matching, including bounded multiline imports
- Actionable concept-search selection and inactive/noisy path filtering
- Exact applicability-edge construction and finding-to-edge verification
- Semantic minimum-version comparison for Node, React Native, and TypeScript
- Removed-dependency operational-reference preflight
- Allowlisted version-pinned official documentation extraction
- Schema-valid deterministic graph draft generation
- Public-only pull-request event validation and stable revision run IDs
- GitHub API pagination, sanitized failures, and single-comment upsert behavior
- Shared CLI/Action analysis path with identical provider caps and graph verification

## Historical-PR eval

Store large raw samples in `scratch/evals/`. Commit only a small, licence-safe fixture or a link and expected facts.

Each report is scored from 0 to 2 on:

- Correctness: no unsupported material claims
- Relevance: changes apply to observed repository usage
- Actionability: migration/test advice is specific
- Evidence: each material claim has a working source
- Brevity: a developer can scan it in under two minutes

Pass thresholds:

- 12/15 reports add value beyond the source bot
- Mean score at least 8/10
- Unsupported material claim rate below 5%
- Cost below A$0.50/report with a 30% retry buffer

Current result (2026-08-11): strict typechecking plus 62 tests pass. OpenRouter OpenAI Mini with graph v2 scores 9.267/10, produces 12/15 useful combined reports, and has zero unsupported material claims. It cost US$0.048979 for 15 reports. DeepSeek Flash v2 was rejected after missed findings and a directionally incorrect impact was blocked by graph verification. The manual baseline remains 9.133/10. Graph v2 reproduces 11 useful cases, the deterministic preflight covers the twelfth, and all three intended safe omissions remain empty.

The arbitrary-PR pipeline completed on historical public PR `fr12k/terraform-monorepo-action#138`, found the retained `@vercel/ncc` invocation, spent US$0, and reused its verified report on rerun. The actual Action entry point then created a report on owned public fixture PR `mohdrumman1/upgrade-impact-action-test#1`; a second run reused the cache, updated the existing marked comment, and left exactly one report comment. GitHub-hosted runner execution remains the publication gate.

## Regression policy

Every prompt or model change reruns the frozen eval set. A release fails if correctness or evidence regresses, even if the aggregate score rises.

Run `pnpm eval:inputs && pnpm eval:applicability` after any release-fact, concept-search, graph, or v2 prompt change. This rebuilds ignored graph artifacts and proves structural integrity plus the three focused regressions without a model call.

Run `pnpm eval:drafts` to create zero-cost diagnostic reports and verify every generated finding against the graph. The applicability expectation file distinguishes 11 graph matches, one deterministic preflight, and three safe omissions.
