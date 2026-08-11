# Day 4 manual evaluation

Date: 2026-08-09

Day 4 added four reports and corrected a deterministic evidence gap discovered before scoring. Npm executable metadata is now used to find repository invocations such as `@biomejs/biome` through its `biome` command and `concurrently` through its `conc` alias.

| Case | Result | Score |
| --- | --- | ---: |
| `concurrently-8-to-9` | Relevant CLI usage found; v9 flag/API breaks are not present in supplied usage | 10/10 |
| `shared-tsconfig-major` | Direct preset inheritance makes the TypeScript 5 requirement actionable | 10/10 |
| `storybook-6-to-7` | Safe omission: acquired notes are insufficient for a 6-to-7 migration claim | 8/10 |
| `biome-patch` | Executable-aware evidence links the patch to existing lint, format, and integration checks | 9/10 |

Eight of 15 cases are now scored. The aggregate is **73/80 (9.125/10 mean)** with no known unsupported material claims. Two safe-omission reports do not yet count as value beyond the source bot, so the final usefulness threshold remains open.

Paid API spend remains A$0. Provider token usage and the per-report cost gate remain unmeasured.
