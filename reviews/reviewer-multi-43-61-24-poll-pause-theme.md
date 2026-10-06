# Review: multi-43-61-24 poll, pause, theme

Reviewed hash: `3d816686a46a136810cae304d5645fc847654be3`
Worktree: `/home/nryn/work/chaaya-wt/multi-43-61-24-rev-r1` (detached HEAD, confirmed with `git log -1`)
This file records one agent's read of the handed hash. It is not a maintainer approval.

The reviewer did not write this change, edited nothing, and committed nothing. All runs below happened in the review worktree above.

## Scope read

Read `git diff main...3d81668` in full. 21 files, about 1095 insertions and 18 deletions, over three commits (`c9d46ba` pause plus poller, `2ed5573` browser pins, `3d81668` scope and theme docs). Read issues #43 (polling follower), #61 (pause while hidden or offline), and #24 (theme setup docs) with every comment, including the owner comments that require one shared visibility and online watcher between `JobStream` and the poller, and a static plus WebView safe theme example.

## Verification runs

Gate, first pass: a stale process held port 4173 (a sibling worktree's Playwright run on the same host). I killed only that holder, confirmed the port free, then ran `npm ci` and `./tools/check.sh`. Result: `Every check passed.`

Gate, second pass: 211 passed, 6 failed. All 6 failures are Firefox legs of `tests/playwright/audio-support.spec.ts` (2) and `tests/playwright/session-guard.spec.ts` (4). Neither spec imports or exercises any changed module (checked imports and content). The failures are audio take timing and beacon timing assertions. This second run overlapped a sibling worktree's full Playwright suite on the same host, which is a known resource contention source for exactly these host sensitive specs. The first pass with a quiet host was fully green. Every pin this change cites passed in both runs and both engines: `job-pause.spec.ts`, both `job-poll.spec.ts` tests, and all three `theme.spec.ts` tests, in Chromium and Firefox.

Independent pins, run separately on the handed hash:

- `npx vitest run src/lib/core/sse/loop.test.ts src/lib/core/job/poll.test.ts`: 2 files, 13 tests, all passed.
- `npx playwright test --project=chromium tests/playwright/job-pause.spec.ts tests/playwright/job-poll.spec.ts`: 3 passed.
- `npx playwright test --project=firefox tests/playwright/job-pause.spec.ts tests/playwright/job-poll.spec.ts`: 3 passed. No server connection flake recurred. The author's reported late Firefox leg flake did not reproduce here.

No clean clone triple run was needed. `tools/check.sh` is untouched by this change, so the clean clone rule for gate changes does not apply.

## Findings

No actionable findings. Every candidate below was checked and either clears or is routed out with its owning path.

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| OUT_OF_SCOPE (M if real, judged environmental) | `tests/playwright/audio-support.spec.ts:47` and `:100` at the reviewed hash | Two Firefox legs asserting generated take marker spacing and gap reads failed during a gate rerun that shared the host with a sibling worktree's full Playwright run. Pin status: failing assertions observed in the rerun log, not reproduced for this change's pins. Owning path: `tests/playwright/audio-support.spec.ts` and the audio take code it exercises. No import path reaches `src/lib/core/sse/pause.ts`, `loop.svelte.ts`, `src/lib/core/job/poll.svelte.ts`, or the theme docs. | Gate rerun log (environmental, see above) | None, not this change's code |
| OUT_OF_SCOPE (M if real, judged environmental) | `tests/playwright/session-guard.spec.ts:49`, `:270`, `:396` (two variants) at the reviewed hash | Four Firefox legs asserting beacon close counts, keepalive budget share, and exact body bytes failed in the same contended rerun. Pin status: same log. Owning path: `tests/playwright/session-guard.spec.ts` and the session guard code it exercises, which uses its own `node:http` harness server and timing sensitive assertions. No import path reaches any file this change touches. | Gate rerun log (environmental, see above) | None, not this change's code |

False positive candidates examined and cleared (no defect, so no rows):

- Svelte 4 idioms: none found in new or touched reactive files.
- Import time browser globals: `pause.ts` touches nothing at import, `isPaused` and `watchPause` guard with `typeof` checks. `loop.svelte.ts` keeps its server guard. `poll.svelte.ts` touches nothing at construction. Server safety step passed.
- Visual values: only match is the private field `#deadline`, an identifier, not a colour.
- Consumer names: none in the tracked diff. The theme page says WebView wrapper, a generic platform shape.
- Planning references: none in the diff. Comments state their own reasons.
- Docs style: no semicolons outside a TypeScript fence, no em dashes, no sentence over 30 words.
- `mergeProgress` is newly exported from `job.svelte.ts` but not re-exported through `job/index.ts` or `core/index.ts`, so the public API promise is unchanged apart from the intended additions.
- Logic review: poller backoff, error budget, timeout with paused time excluded, abort handling, and the shared pause watcher all match the documented behaviour and issue acceptance. FrameLoop pause and resume reset attempts, resend Last-Event-ID, honour the opt out, and remove listeners on close.

Process note, not a finding: this branch lands work for three issues (#43, #61, #24) in one change while the protocol says one issue, one branch, one pull request. That shape was handed to this review as given under the owner override, it carries no code defect, and no pin could decide it, so it does not affect the verdict.

## The seven questions

1. Did a Svelte 4 idiom slip in? No.
2. Does a module touch a browser global at import time? No.
3. Does a component carry a visual value? No.
4. Does the change, its issue, or its pull request name a consumer? The tracked change does not.
5. Does any code, comment, or test cite a planning file or a private note, or did stripping one lose the reason it carried? No.
6. Does `docs/scope.md` still match what the change covers? Yes.
7. Was this review run on the handed hash, in a worktree of its own? Yes. `3d816686a46a136810cae304d5645fc847654be3` in `/home/nryn/work/chaaya-wt/multi-43-61-24-rev-r1`, detached, no edits, no commits.

## Verdict

Severity counts: C 0, H 0, M 0, L 0. Two OUT_OF_SCOPE rows routed to their owning audio and session guard paths, neither blocking.

APPROVE. This round leaves zero residue: there are no prior rounds, and this read returns no finding of any severity against the reviewed hash.
