# Review: topic SSE, issue 9, round 2

Written by GLM 5.3 Flash, a coding agent review. This file rides the branch and records one
model's read. It is not a maintainer approval.

- Hash reviewed: `8737ca852f95bb060194c2ba7b3822e3dcba13f1` (branch `issue-9-topic-sse`, the
  remediation commit on top of round 1's review commit `847a56a`)
- Worktree: `/home/nryn/work/chaaya-wt/issue9-rev-r2` (detached at the hash)
- Round 1 file: `reviews/glm-vibe-issue-9-topic-sse.md`, verdict REMEDIATE, 1 M, 1 L

## Round-1 findings, one round later

| Finding | Verdict | Evidence |
| --- | --- | --- |
| M: a throwing `onComment` is a dropped stream, not a dropped frame | Fixed. | `#dispatch` wraps the comment call in the same try/catch the `onFrame` branch has, and the `FrameLoopOptions.onComment` doc now states "A thrown error is a dropped frame, not a dropped stream". A regression test pins it: `events.test.ts` "a throwing onComment drops the comment and does not reconnect" asserts one fetch, connection stays `live`. Mutation check in this worktree: removing the guard fails exactly that test (the stream reconnects), and the tree was restored afterwards. |
| L: `isReplayId` and `nextEventId` exported from both barrels | Fixed. | Both export lines now carry `FrameLoop` only. The helpers stay module-internal; `events.svelte.ts` imports `isReplayId` from `./loop.svelte.js`, which is the intended home. Nothing else imports either name. |

The commit also documents the two round-1 observations (a terminal name absent from the `events`
filter can never stop the stream, and `prime()` with a terminal event closes before `attach()`)
in the options docs, the class comment, the docs page, and the route. Both statements match the
code's behaviour.

## What the gate measured in this worktree

`npm ci`, then `./tools/check.sh`. svelte-check, eslint, the Svelte 4 leakage scan, the visual
values scan, the Keel fixture byte diff, and vitest (223 tests, 30 files, including the new
regression test) all passed. The Playwright leg failed one test: `[firefox]
tests/playwright/audio-stream.spec.ts:174 a flush stops the audio within one block` — the same
leg that flaked in round 1. 191 other tests passed. Re-run alone: passed (exit 0). The branch
touches no audio module and no test. I read it as the workstation flake again.

Because the gate stops at Playwright, the remaining steps ran by hand in this worktree:
svelte-package, publint, the published-api check (deferred), the published-types probe, the
server-safety import of every key, the consumer-name scan, and the plan-reference scan. All
passed. The removal of two barrel exports changes the public API surface, and the
published-types probe still typechecks every export key from the packed tarball, so the narrower
surface is verified against a consumer-shaped import.

## Residue claim

Zero findings remain from round 1, severity by severity: the M is fixed and pinned, the L is
fixed and the package probe proves nothing needed it. No new findings this round.

## Verdict

**APPROVE.** 0 C, 0 H, 0 M, 0 L. No verdict on anything outside `main...8737ca8`.
