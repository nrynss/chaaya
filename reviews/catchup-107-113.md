# Catch-up review of #107, #108, #110, #111, #112, #113 (with #114)

These PRs merged on the executor's own review and green CI. CodeRabbit
posted only rate-limit notices on them. This file records a second,
adversarial pass over the merged code on main at 13c40f5.

## Real bugs (fixed in this PR)

1. **Medium. `FrameLoop.attach()` and `JobPoller.attach()` were not
   idempotent.** (Introduced by #107, the SSE loop and job follow off runes.)
   - An attach after the stop added a visibility, online and offline watch
     that nothing ever removed, because `close()` returns early once
     stopped. With #114, a React component that remounts on the same target
     after a real unmount hits this path.
   - A second attach while live opened a second stream or poll and
     overwrote the first watch's unwatch, so that watch leaked too. Two
     Svelte components that `attach` one loop hit this.
   - Fix: an attach after the stop, or a second attach while live, opens
     nothing and returns the same teardown. Tests:
     `src/lib/core/sse/attach-once.test.ts`. All four fail before the fix.
2. **Low-medium. `EditHistory.entries` snapshots changed under their
   readers.** (Introduced by #110.) The array was replaced on each change,
   but undo, redo and flush changed `applied` and `committed` on the shared
   entry objects. An old snapshot therefore changed, and a row memoised on
   entry identity never re-rendered. This contradicts the docs, which say
   entries are "replaced on change, never mutated". Fix: `entries` returns
   frozen copies, rebuilt once per change. Tests are in
   `src/lib/history/notify.test.ts`, under "entries snapshots".

## Non-issues checked

- `Notifier`: it bumps the version before listeners run, copies the set
  before iterating, skips a listener removed mid-notify, isolates throws, and
  makes unsubscribe idempotent.
- Svelte `reactive`: the subscription is ref-counted by `createSubscriber`,
  methods are bound and cached, and frozen own properties are respected.
  `attach` runs untracked.
- React `useObservable`: it uses `version` as the snapshot, and the server
  snapshot is the same. `useAttached` (#114) ref-counts per target and
  defers teardown a microtask. Its interaction with bug 1 is covered above.
- Arrays held by `PcmStreamPlayer.blocks`, `AudioRecorder.chunks` and
  `ShortcutDispatcher.scopes` are replaced or copied. `ShortcutDispatcher`
  is not observable.
- `ThemeStore` is lazy, so construction at import time is SSR-safe.

## Nits (not changed)

- `useAttached`: if `attach()` returns a non-function, the work has already
  started when the TypeError is thrown, so that work is leaked. Same in the
  Svelte `attach`. This is a programmer error only.
- `EditHistory.serverDoc` setter notifies even when it is given the same
  value.
- `ThemeStore.set()` on the server touches `document` without a guard. A
  server render does not call it.
- With a shared attachment, either teardown closes the target. This is
  documented and matches `ClipScheduler`.

## Not verified

- No browser leg (Playwright) on this box for this pass. WebKit is
  unavailable here.
- The diffs of #108 (audio), #111 (gate) and #113 (docs) got a lighter pass
  than the core, history and binding code.
