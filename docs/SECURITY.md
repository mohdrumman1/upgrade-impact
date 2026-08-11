# Security and privacy

## MVP permissions

Read-only repository contents and pull-request metadata. The MVP does not write code, merge pull requests, access secrets, or request organisation administration.

The Action additionally requests pull-request write permission solely to create or update its one marked analysis comment. It does not request issue administration, workflow, package, deployment, or organisation permissions.

## Data minimisation

- Send only package-relevant file excerpts if hosted analysis is selected.
- Never send `.env`, credentials, generated bundles, vendored dependencies, or unrelated source.
- Do not persist private source in logs.
- Redact likely secrets before any model call.
- Retain derived report metadata separately from source excerpts.

## Output trust

- Every material release claim requires an official evidence URL.
- Every repository claim requires a path that exists in the analysed commit.
- Low-confidence results must say so and omit unverified recommendations.
- Treat release notes and repository text as untrusted input that may contain prompt injection.

## Pull-request execution boundary

- The public beta accepts public repositories only.
- `pull_request_target` runs trusted Action code, but UpgradeImpact never checks out, imports, builds, tests, or executes the pull-request head.
- Changed manifests are downloaded as text through the GitHub API. Repository usage is searched with `git grep` and read with `git show` from an immutable bare base-commit snapshot.
- Repository names, SHAs, event actions, manifest counts, dependency counts, file sizes, pagination, process time, and output size are bounded or validated before use.
- GitHub and model error bodies are not logged. API keys remain process environment values and are never included in cached artifacts.

## Approval gates

Human approval is required before changing GitHub permissions, production deployment, billing, data retention, or the model provider.

The 2026-08-10 approval covers bounded provider evaluation and public-repository report automation. OpenRouter routing denies data-collecting endpoints where supported and requests strict ZDR. The user explicitly authorized the session-provided credential for the bounded v2 evaluation and end-to-end public-data check. It was passed only as process environment state and was not written to repository files, documentation, artifacts, or Git. The 2026-08-11 approval also covers creation of the owned public fixture repository and public beta Action publication after end-to-end verification. Production hosted deployment, subscription billing, and private-repository processing remain separate gates. API keys remain environment-only; only sanitized provider error codes may be logged.
