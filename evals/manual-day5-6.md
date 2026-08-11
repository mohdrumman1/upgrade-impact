# Manual evaluation — Days 5 and 6

Date: 2026-08-10

## Result

- 15/15 historical cases scored.
- Mean: 9.133/10 (137/150 points).
- 12/15 reports add repository-specific value beyond the source bot.
- Three safe omissions: Radix Switch, Storybook 6-to-7, and the long OpenTelemetry Node SDK jump.
- No known unsupported material claim; deterministic schema and prepared-citation validation passes.
- Content thresholds pass. Actual provider token usage and AUD cost remain unmeasured.

## Day 5 finding

The first pass exposed a deterministic acquisition problem: keeping only the three newest releases often displaced the compatibility boundary for major and 0.x minor upgrades. Removal evidence also selected releases newer than the removed version.

## Day 6 correction

Release selection now keeps the target, the first available compatibility boundary, then fills the remaining bounded slots with the newest evidence. Removed dependencies select releases at or below the removed version. This recovered, among other evidence, Safe Area Context 5's React Native 0.74 floor and Agents' earliest available post-0.13 minor boundary without increasing the three-excerpt limit.

## Remaining gate

Run the frozen prompts through the selected snapshot, save raw provider usage only under ignored scratch state, validate parsed reports, and calculate actual AUD cost. The manual outputs are the rubric baseline, not claimed provider outputs.
