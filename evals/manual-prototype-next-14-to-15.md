# Manual prototype: Next.js 14 to 15

Case: [ATran2000/myflix#14](https://github.com/ATran2000/myflix/pull/14)

Actual manifest transition: `next` `^14.2.8` to `^15.5.18`. The PR title says 14.2.12, so the product must trust the commit diff rather than title text.

## Candidate report

Risk: **medium-high**. Confidence: **0.88**.

This repository uses the Pages Router and React 18, which Next.js 15 supports, but the upgrade leaves `eslint-config-next` on 13.3.0 and the historical Vercel deployment failed. The exact deployment failure is not public, so the report must not claim a root cause.

### 1. Upgrade the Next.js ESLint config with the framework

The manifest upgrades Next.js to 15.5.18 but leaves `eslint-config-next` at 13.3.0. The official upgrade guide tells manual upgrades to update Next, React, React DOM, and `eslint-config-next` together.

- Repository evidence: [`package.json:18-23`](https://github.com/ATran2000/myflix/blob/7f722d7ff782fe3a346cd29cc42152f0cbf0afb4/package.json#L18-L23)
- Release evidence: [official Next.js 15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15)
- Check: align `eslint-config-next` with Next 15, then run the existing lint and build scripts.

### 2. App Router async-API breakage appears inapplicable

The repository uses `pages/`, `next/app`, `next/router`, and Pages API routes. No App Router `cookies`, `headers`, `draftMode`, page `params`, or page `searchParams` usage was found. The headline Next.js 15 async-request breaking change therefore should not be presented as affecting this repository.

- Repository evidence: [`pages/_app.tsx:1-17`](https://github.com/ATran2000/myflix/blob/7f722d7ff782fe3a346cd29cc42152f0cbf0afb4/pages/_app.tsx#L1-L17), [`pages/api/random.ts:1-22`](https://github.com/ATran2000/myflix/blob/7f722d7ff782fe3a346cd29cc42152f0cbf0afb4/pages/api/random.ts#L1-L22)
- Release evidence: [Next.js 15 breaking-change list](https://nextjs.org/blog/next-15)
- Check: exercise Pages Router navigation and API routes; do not schedule an App Router codemod unless another path shows App Router usage.

### 3. Verify the production runtime and failed deployment

Next.js 15 raised the minimum Node.js version to 18.18.0. This repository has no `engines` declaration, so compatibility cannot be proven from the manifest. The historical Vercel check failed, but its logs are not public.

- Repository evidence: [`package.json:1-35`](https://github.com/ATran2000/myflix/blob/7f722d7ff782fe3a346cd29cc42152f0cbf0afb4/package.json#L1-L35)
- Release evidence: [official Next.js 15 release notes](https://nextjs.org/blog/next-15)
- Check: confirm Node 18.18+ in Vercel/CI, inspect the failed deployment log, and require `npm run build` to pass before merge.

### Deferred warning

The repository uses `next lint`. Next.js 15.5 deprecates this command ahead of its removal in Next.js 16. It is not an immediate blocker for this upgrade, so it belongs in a lower-priority warning rather than the main risk list.

## Prototype score

| Criterion | Score | Note |
| --- | ---: | --- |
| Correctness | 2/2 | No root cause is invented for the failed deployment. |
| Relevance | 2/2 | Pages Router evidence removes irrelevant App Router warnings. |
| Actionability | 2/2 | Three precise checks use existing scripts and deployment data. |
| Evidence | 2/2 | Each material claim links repository and official release evidence. |
| Brevity | 1/2 | Useful, but the production renderer should compress it further. |
| **Total** | **9/10** | Manual task-model fit passes for this representative case. |

Manual prototype API spend: A$0. Production token cost is not yet measured; the A$0.50/report gate remains open.
