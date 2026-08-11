# UpgradeImpact onboarding

## Five-minute setup

1. Add an OpenRouter API key as a repository Actions secret named `OPENROUTER_API_KEY`.
2. Create `.github/workflows/upgrade-impact.yml` using the example below.
3. Open or refresh a public npm dependency pull request.

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
      - uses: mohdrumman1/upgrade-impact@v1-beta.4
        with:
          github-token: ${{ github.token }}
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

UpgradeImpact calls the model only when deterministic evidence contains an applicability edge. Reports with no applicable edge and deterministic removed-dependency findings cost nothing.

## Hosted beta setup

Hosted beta tenants receive an endpoint and opaque license key. Store the key as `UPGRADE_IMPACT_BETA_TOKEN`, store the endpoint as the Actions variable `UPGRADE_IMPACT_BETA_ENDPOINT`, then use:

```yaml
      - uses: mohdrumman1/upgrade-impact@v1-beta.4
        with:
          github-token: ${{ github.token }}
          hosted-endpoint: ${{ vars.UPGRADE_IMPACT_BETA_ENDPOINT }}
          license-key: ${{ secrets.UPGRADE_IMPACT_BETA_TOKEN }}
```

Do not configure both hosted and bring-your-own-key modes. Hosted access is invite-only during beta.

## What the workflow can access

- Public repository contents at the immutable base revision.
- Pull-request metadata and changed manifest text.
- Permission to create or update one marked pull-request comment.

It never checks out or executes pull-request code. See [security](SECURITY.md) for the complete boundary.

## Troubleshooting

- `Missing hosted license key or OPENROUTER_API_KEY`: configure one complete model-access mode.
- `Hosted endpoint and license key must be configured together`: add both hosted inputs or remove both.
- `Only public pull requests...`: private-repository processing is not enabled during beta.
- No comment: confirm the workflow has `pull-requests: write` and ran on a supported `pull_request_target` event.
- Safe omission: the dependency changed, but UpgradeImpact found no exact edge between official release evidence and repository usage. This is expected and costs nothing.

Provider and GitHub response bodies are deliberately omitted from errors so credentials or untrusted content cannot reach logs.
