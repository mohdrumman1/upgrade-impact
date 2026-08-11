# UpgradeImpact

UpgradeImpact posts repository-specific, evidence-backed npm dependency upgrade reports on public pull requests.

It compares changed manifests, searches bounded repository usage, acquires official release evidence, builds exact applicability edges, verifies every generated finding against those edges, and creates or updates one pull-request comment. Pull-request code is never checked out or executed.

## Install

Create `.github/workflows/upgrade-impact.yml`:

```yaml
name: UpgradeImpact

on:
  pull_request_target:
    types: [opened, reopened, ready_for_review, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  analyse:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: mohdrumman1/upgrade-impact@v1-beta.3
        with:
          github-token: ${{ github.token }}
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

Add `OPENROUTER_API_KEY` as an Actions secret. It is used only when deterministic applicability edges require model synthesis. Safe omissions and deterministic preflight reports cost nothing and do not require the key.

Hosted beta users can replace `openrouter-api-key` with `hosted-endpoint` and `license-key`. The runner still performs repository acquisition and secret filtering; only bounded graph-filtered evidence reaches the hosted API, and the Action verifies the returned report locally before posting it.

## Safety and cost

- Public repositories only during beta.
- No PR-head checkout, imports, builds, tests, hooks, or code execution.
- Read-only contents plus permission to update one marked PR comment.
- Sensitive paths excluded and likely credentials redacted before model processing.
- Findings require both exact repository lines and official release evidence.
- OpenRouter OpenAI Mini is graph-verified; default hard cap US$0.02/report, absolute cap US$0.05.
- Pipeline artifacts are revision-keyed and resumable within the runner job. The least-privilege template intentionally avoids Actions write permission for cross-run cache persistence.

See [security](docs/SECURITY.md), [architecture](docs/ARCHITECTURE.md), and [testing](docs/TESTING.md) for implementation details.
