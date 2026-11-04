# Review: SSE loop and job follow off runes

This file records one agent's adversarial read of the change. It is not a maintainer approval.

## Scope read

`FrameLoop` (`core/sse/loop.ts`), `createEventStream` (`core/sse/events.ts`), the core `JobStream` (`core/job/job.ts`), `JobPoller` (`core/job/poll.ts`), and the Keel `JobStream` (`adapters/keel/job/job.ts`) move from `.svelte.ts` to `.ts` on `Notifier`. `runInEffect` leaves core for `src/lib/svelte/run-in-effect.svelte.ts`, which the package does not export. `CreditWallet` keeps it until #97 and bridges the now plain poller into its runes. A new `notify.test.ts`. `/docs/job`, `tests/job`, and `tests/job-poll` use `reactive` and `attach`. README, `docs/scope.md`, `docs/job-progress.md`, `docs/adapters.md`, `docs/sse-recovery.md`, and the CHANGELOG are updated. Issues #96, #95, and #93 were read for the contract.

## Verification runs

- `CHAAYA_SKIP_BROWSER=1 ./tools/check.sh`: every step passed, including the Keel fixture step (skipped copy, committed fixtures parsed), 542 tests.
- No `$state`, `$effect`, or `svelte` import is left under `core/sse`, `core/job`, or `adapters/keel/job`.
- The existing `loop`, `events`, `job`, `poll`, `plain-adapter`, `snapshot-recovery`, and Keel `catchup` tests pass. Their only edits are the `attach` call sites and the module specifiers the renames forced.
- Playwright on Chromium and Firefox: `job`, `job-poll`, `job-pause`, `credit-wallet`, `app` (which covers the docs routes, including `/docs/job` and `/docs/wire`), and `bindings`. 50 passed.
- Mutations, each restored from a copy after the run:
  - a terminal frame's stop notifying on its own: 4 tests fail
  - catch-up close notifying twice: 1 fails
  - no Keel re-notify: 1 fails
  - `frames` mutated with push: 9 fail
  - `events` mutated with push: 9 fail
  - notify on every frame: 4 fail
  - prime notifying twice: 1 fails
  - a no-op poller teardown: 1 fails
  - `noteId` notifying without a move: 1 fails
  - removing `reactive` on `tests/job`: 15 Playwright tests fail
- One process note. A first mutation pass restored files with `git checkout` while the renames were staged with their old content, which reverted the conversion. The edits were re-applied from the same script, committed, and the pass was rerun with copies. The results above come from that rerun.

## Review questions

1. One notify per logical change. A kept frame notifies once through the loop, and the owner changes its own state inside `onFrame` without notifying. A frame that keeps, moves the cursor, and stops is one notify (`#stop` is quiet there). A dropped frame that leaves the cursor alone notifies nothing. A catch-up that lands notifies once, including when it closes the watch. A prime or catch-up event on `createEventStream` notifies once, including the cursor move and a terminal close.
2. Partial changes. If `onFrame`, `onAccept`, or `onPoll` throws after the owner changed state, the change still notifies, so a view never shows stale state. Before this change a rune showed such a change, so this keeps behaviour.
3. Wire behaviour. `isReplayId`, `nextEventId`, `mergeProgress`, frame parsing, `fetchInit`, reconnect, pause, and the catch-up freshness rule are byte for byte the same. Only field writes and notifies changed.
4. Lifecycle. `attach()` returns `() => this.close()`. Close is idempotent, and teardown stops later frames from notifying (tested). An aborted signal on the poller still returns a teardown. The binding opens the stream after mount instead of during init. The class doc was updated, and the job specs pass.
5. Wallet. `JobPoller` no longer has rune fields, so `CreditWallet.topUp` would go stale in a template. A `#followerTick` rune bumped by the follower's `subscribe` keeps it reactive until #97. The poll still starts before the cleanup runner is called, which the wallet tests rely on.
6. Server safety. Construction still touches nothing. Subscribing an owner to its private loop is plain object work. The server safety step passed.

## Findings

| Severity | Where | What | Status |
|---|---|---|---|
| L | `core/job/job.ts` class doc | It still said a component calls `attach()` during initialisation and the stream opens before the first render. With the binding, it opens on mount. | Fixed in the commit that carries this file. |
| INFO | public types | `connection`, `reconnects`, `lastEventId`, `lastComment`, `progress`, `error`, and `frames` were writable rune fields. They are read-only getters now, and `events` and `frames` are `readonly` arrays. Nothing in the repo wrote them. | Listed in the CHANGELOG and the PR as a 0.6.0 change. |
| INFO | `FrameBuffer` | It is not reactive and was not a rune. It keeps its mutable list and `drain()`. | No change. |

## Severity counts and verdict

Round one: C 0, H 0, M 0, L 1 (fixed), INFO 2. Verdict: REMEDIATE.

## Round two

Reviewed hash: `23d5101`.

- The round-one L is resolved. The `JobStream` class doc now says `attach()` returns the teardown and that the binding opens the stream on mount.
- I read the full diff again: the five converted classes, the wallet bridge, the internal `runInEffect`, the routes, and the docs.
  - Owner suppression is correct. `#applying` is set only around synchronous work, and the loop notifies synchronously, so no notify slips through or gets lost.
  - `EventStream` now extends `Observable`, so a hand-written implementation must add `subscribe` and `version`. That belongs to the 0.6.0 break and is noted in the CHANGELOG with the other type changes.
  - The diff touches 29 files, under the size where CodeRabbit skips a PR.
- `npx eslint src/lib/core/job` and `npx vitest run` (542) passed on this head.

C 0, H 0, M 0, L 0. Residue: none. Verdict: APPROVE, pending CodeRabbit.
