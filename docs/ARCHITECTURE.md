# Architecture

## Pipeline

```text
receive -> acquire -> prepare -> analyse -> verify -> render -> record
```

- `receive`: validate a dependency PR event and build an idempotency key.
- `acquire`: obtain manifest changes, official release notes, and repository usages.
- `prepare`: reduce inputs to relevant, bounded evidence.
- `analyse`: synthesize candidate risks into structured output. This is the only model-dependent stage.
- `verify`: confirm every cited path, line range, and official URL appeared in the deterministic prepared input.
- `render`: generate the pull-request comment.
- `record`: store cost, latency, confidence, and user feedback.

Each stage has explicit input/output, may be rerun safely, and persists enough state to avoid repeating model calls.

## Applicability graph

The measured model runs show that citation presence is insufficient: models can cite real but semantically unrelated evidence. The v2 preparation stage now builds a typed bipartite graph:

```text
release fact --exact concept edge--> repository usage
```

Release facts carry a kind and concept such as `runtime:node`, `cli-flag:--max-processes`, `api-symbol:@scope/package#SimpleSpanProcessor`, or `config-key:fetchMock`. Repository usages carry the same typed concepts plus exact paths and ranges. API symbols are package-qualified to avoid joining identical names from different packages. Only deterministically matched pairs enter the synthesis prompt. Unmatched release facts become omission candidates, preventing the model from turning generic release notes into repository findings.

The graph directs a second bounded repository search for actionable unmatched concepts. Sensitive, documentation, lockfile, build-output, vendor, and disabled-workflow paths remain excluded. Each concept keeps at most two release facts and two repository proofs. Result verification requires every finding's official URL and repository range to resolve through the same edge.

Graph v2 also compares Node, React Native, and TypeScript minimum versions; creates dependency-scope edges only when an allowlisted official source names the dependency and repository evidence shows direct use; and keeps generic scope edges subordinate to more specific API or constraint edges. A separate deterministic preflight reports removed dependencies that remain operationally referenced because that fact does not require release-note synthesis.

Official evidence acquisition remains package-aware. GitHub Releases and commit-pinned changelogs are preferred. A narrow version-pinned Markdown fallback is allowlisted for Next.js major-upgrade guides because Next.js does not publish equivalent GitHub Releases.

## Current slice

Deterministic manifest comparison, removed-dependency preflight, repository evidence preparation, concept-directed acquisition, typed applicability preparation, secret filtering, package-aware official evidence acquisition, exact prompt generation, schema and applicability verification, diagnostic deterministic drafts, and customer-facing report rendering are implemented. OpenRouter OpenAI Mini is selected after graph v2 passed the frozen gate. The arbitrary-public-PR command persists deterministic, evidence, release, graph, prompt, preflight, report, and cost artifacts under a base-and-head-revision run ID. It resumes completed stages within a runner job, skips the model when the graph has no applicability edges, and reuses a verified final report when state is restored by an authorized caller. The least-privilege public template does not grant Actions write permission for cross-run cache persistence. The Action validates the event, reads untrusted manifests through the API, searches only a bare immutable base snapshot, and upserts one marked PR comment without executing PR code.

## State

```ts
type AnalysisState = {
  id: string;
  repository?: string;
  pullRequest?: number;
  changes: DependencyChange[];
  status: "received" | "acquired" | "prepared" | "analysed" | "verified" | "rendered" | "failed";
  confidence?: number;
  costAud?: number;
};
```

## Token controls

- Stable instructions precede dynamic repository content.
- Release notes are cached by package and version pair.
- Search selects only files that import or configure the package.
- Official npm `bin` metadata adds bounded executable aliases to repository search terms.
- File excerpts are line-bounded and deduplicated.
- Model output uses a small JSON schema.
- Generated prompts expose character, byte, and approximate token counts before a model is called.
- Existing stage outputs are reused on retry.
- Valid provider results are revalidated and reused from `scratch/benchmarks/` before any paid call.
- Large traces live in `scratch/`, not prompts or Git history.

## Private-repository design

Hosted minimal-snippet processing is selected:

- Repository search is deterministic.
- Only package-relevant, line-bounded excerpts enter the evidence pack.
- Likely secrets and sensitive paths are excluded before model processing.
- Raw private source is not written to application logs.
- Derived reports and cost/quality metadata are stored separately from transient excerpts.

Runner-local processing is deferred until customer evidence justifies the onboarding and support cost.
