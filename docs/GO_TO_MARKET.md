# Go-to-market

Updated: 2026-08-11

## Low-touch launch path

1. Pass the frozen 15-case quality and cost gate.
2. Publish a free public-repository GitHub Action in its own public repository.
3. List the Action in GitHub Marketplace for organic discovery.
4. Add a hosted private-repository beta with a Stripe subscription Payment Link and hosted customer portal.
5. Add a paid GitHub Marketplace App plan only after eligibility and demand justify its onboarding work.

GitHub currently publishes qualifying Actions immediately without review, but the Action must be public, contain a single root `action.yml` or `action.yaml`, use a unique name, and be released from a dedicated repository. A paid Marketplace App is slower: GitHub expects a verified organization and at least 100 GitHub App installations. This makes external self-serve billing the fastest initial revenue path.

Stripe Payment Links support recurring subscriptions and hosted customer self-management without a custom billing UI. Australian standard pricing has no setup or monthly fee; transaction fees apply. Cloudflare Workers has a free tier, so the beta can remain near A$0 fixed infrastructure cost until usage proves demand.

## Working timeline

| Milestone | Earliest | Planning range | Gate |
| --- | ---: | ---: | --- |
| Complete 15-case validation | Day 5 | Days 5-7 | Mean >=8/10, unsupported claims <5%, measured cost <A$0.50/report |
| Working GitHub Action | Completed Day 12 | Days 8-12 | Local Action entry point created and updated one comment on an owned public PR; GitHub-hosted run is the final publication check |
| Public Marketplace listing | Day 10 | Days 10-14 | Dedicated public repository, action metadata, security documentation |
| Paid hosted beta | Day 14 | Days 14-21 | Private-data retention decision, model cost cap, subscription checkout |
| First revenue | Week 3 | Weeks 3-6 | At least one self-serve customer; depends on organic discovery |
| A$500 monthly profit | Week 6 | Weeks 6-12 | Roughly 5 Team or 13 Solo subscriptions before variable costs |
| A$5,000 monthly profit | Month 4 | Months 4-9 | Roughly 43 Team subscriptions or a mixed-plan equivalent before variable costs |

The build dates are controllable; customer acquisition dates are estimates, not guarantees. Avoid paid advertising until the free Action produces activation and repeat-usage data.

The owned fixture is `mohdrumman1/upgrade-impact-action-test`. It exists only for public end-to-end verification and should remain small. Marketplace publication must use a separate public Action repository and an immutable release tag; do not turn the private development repository public.

## Distribution without calls or social posting

- GitHub Marketplace search and repository README examples
- Useful, concise Action output on real dependency pull requests
- Optional footer on free public-repository reports linking to the hosted plan
- Automated onboarding, documentation, email support, and Stripe customer portal
- Later: small paid search/listing experiment only after install-to-repeat-use conversion is measured

## Current pricing hypothesis

- Free: public repositories, limited monthly reports
- Solo: A$39/month
- Team: A$119/month
- Studio: A$299/month

Do not finalize pricing or build complex entitlements until repeated use exists.

## Sources checked

- [GitHub: publishing Actions in Marketplace](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace)
- [GitHub: requirements for listing a paid app](https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app)
- [Stripe Australia pricing](https://stripe.com/au/pricing)
- [Stripe no-code subscriptions](https://docs.stripe.com/no-code/get-started)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
