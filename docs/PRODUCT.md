# Product

## Customer

Small TypeScript teams using Dependabot or Renovate. Initial buyer: an engineering lead responsible for safely merging dependency updates without a dedicated platform team.

## Job

Given a dependency pull request, explain which release-note changes apply to this repository, where they apply, and what should be tested.

## MVP output

A single pull-request comment containing:

1. Dependency and version transition
2. Risk level with confidence
3. Repository-specific affected usages
4. Suggested migration steps and tests
5. Evidence links for every claim

## Success criteria

- At least 12 of 15 historical dependency PR reports add useful information beyond the existing bot.
- At least 80% of recommendations are judged useful under the eval rubric.
- Unsupported factual claims remain below 5%.
- Estimated model cost stays below A$0.50 per completed report.
- A failed or uncertain analysis produces a limited result, not confident advice.

## Non-goals

- General code review
- Automatic merging
- Automatic code changes
- A dashboard
- Python support before npm validation
- Enterprise features
- Live chat or call-based onboarding

## Commercial hypothesis

- Free: public repositories and limited reports
- Solo: A$39/month
- Team: A$119/month
- Studio: A$299/month

Pricing is not final. Repeat usage must be proven before billing work.

The first paid path is hosted private-repository analysis through Stripe-hosted subscription checkout. A free public-repository Action supplies organic discovery; paid GitHub Marketplace billing is deferred until installation eligibility is met.
