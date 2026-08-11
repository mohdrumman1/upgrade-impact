# Day 3 representative manual evaluation

Date: 2026-08-09

The generated v1 prompts were manually analysed without a paid API call. Structured outputs are stored in `evals/manual/` and pass both schema validation and deterministic citation verification.

| Case | Shape | Correctness | Relevance | Actionability | Evidence | Brevity | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `rimraf-5-to-6` | Small, high-signal | 2 | 2 | 2 | 2 | 2 | 10/10 |
| `dependabot-dev-group` | Grouped dependencies | 2 | 2 | 2 | 2 | 1 | 9/10 |
| `radix-switch-patch` | Official-evidence gap | 2 | 2 | 0 | 2 | 2 | 8/10 |

Mean: **9/10**. Combined with the earlier Next.js prototype, four reports now average **9/10** and contain no known unsupported material claims.

## Findings

- Small, repository-specific upgrades can produce concise, actionable reports.
- Grouped upgrades remain viable, but release excerpts that merely point to another changelog reduce brevity and usefulness.
- Safe omission works: the Radix case returns no invented finding when both usage and official release evidence are missing.
- Deterministic citation verification should remain a release gate; schema validation alone cannot detect invented paths or URLs.

## Cost

Paid API spend remains A$0. These reports were produced in the active Codex development session, so provider-level token and billing measurements are not available and the A$0.50/report gate remains open.
