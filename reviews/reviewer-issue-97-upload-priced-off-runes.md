# Review: #97 uploader, priced action and wallet off runes

Branch `issue-97-upload-priced-off-runes`. Reviewer: adversarial self-review.

## Round 1

Acceptance:
- `adapters/keel/upload` and `priced` contain no rune and no `svelte` import. A grep of code and comments is empty.
- The existing `upload`, `priced-action`, `wallet` and `top-up` tests pass. `wallet.test.ts` changed only at the lifecycle call sites: `followTopUp` lost its third argument, and the unused `register` helper went with it.
- New test: "a settled run notifies the wallet once for its refresh, whatever the outcome". It covers an `insufficient` run and a `done` run, and the wallet sequence is `reading, ready` per settled run.
- `/docs/priced-action`, `/docs/credit-wallet`, `/docs/audio-upload` and `/docs/audio-capture`, and their test routes, read the classes through `reactive(...)`. That includes `reactive(wallet.action(...))` and `reactive(resumed)` for `ChunkUploader.resume()`, where `undefined` is checked before wrapping.

Findings and resolutions:

1. **A refresh landing notified twice.** It published the balance, then `ready`. Fixed: it is batched (`#depth`/`#dirty`), and a test pins `ready:60` as one notification.
2. **A follow answer notified twice.** That was the wallet's own write plus the poller's notification. Fixed: the wallet's writes inside `toProgress` stay quiet, and the poller's notification carries them.
3. **The init-time follow in `tests/credit-wallet` lost its automatic teardown** when `runInEffect` went away. Fixed: `onDestroy(stop)`. The docs route already kept the teardown and now stores the returned one.
4. **`onChange` received the nullable getter value.** That was a type error and is fixed: it passes the local balance.
5. `#adopt` used to bump `capturedBytes` once per stored chunk. It now sums the bytes and writes once, with the same final value.

Mutation pass (cp backups): 9 mutations, 8 caught. The survivor splits the `id` and `stored` write on open. It is equivalent under the begin golden, which reports `storedBytes: 0`, so `stored` does not change and the split adds no notification.

Deviation from the issue text, for the owner:
- The issue says the wallet "subscribes to the `PricedAction` instances it creates and re-notifies". No wallet field derives from an action's state, and `onRunSettled` already starts the refresh, including for a run a reset discarded, which an action notification would miss. Subscribing would only add wallet notifications on every quote and phase change. The wallet therefore does not subscribe to its actions. The new test pins that an action's own changes leave the wallet quiet.

Verdict: APPROVE, pending the browser leg and CI.

Browser leg (chromium, firefox): priced-action, credit-wallet, audio-upload, audio-capture and direct-upload, 42 passed. WebKit was not run, because its libraries are missing on this box.

## Round 2

CodeRabbit's review of `bd2d86f` raised one finding, and it holds.

1. **An acknowledgement notified twice.** `#send` wrote `stored` from the chunk answer, and then `#pump` wrote `acknowledged` and `pending`, so a subscriber saw the new stored bytes with the old counts first. Fixed: `#send` returns the stored bytes, and `#pump` writes `stored`, `acknowledged` and `pending` in one change after it removes the chunk from the queue. An answer with no readable count still moves only the counts. A new test pins that stored bytes never move in a notification of their own, and it fails against the previous code.

Re-review: no other write in the uploader splits one logical change. The gate passes, and the audio-upload and audio-capture browser specs pass on chromium, firefox and firefox-sink (24 passed).

Verdict: APPROVE.
