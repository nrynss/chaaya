# Changelog

Changes that reach the published package. A release section names its tag.
Work merged since the last tag sits under Unreleased.

## Unreleased (0.6.0)

0.6.0 makes the core framework-neutral, with Svelte as one binding. It is a
breaking release. The migration guide lands before the freeze.

### Added

- `Notifier`, `Observable`, and `Listener` on `@nrynss/chaaya/core`. A
  stateful class keeps its fields private behind getters and calls
  `notify()` once per logical change. `subscribe(listener)` returns the
  unsubscribe, and `version` increments once per change, before listeners
  run. `subscribe` is bound to its instance, so it can be passed unbound. Notification is
  synchronous. A listener that throws does not stop the others, and its
  error is logged with `console.error`. Nothing is rethrown.
- `@nrynss/chaaya/svelte`, the Svelte 5 binding. `reactive(x)` makes the
  reads of an observable reactive in a template, an effect, or a
  `$derived`. `attach(x)` runs `x.attach()` in the calling effect and calls
  the teardown it returns when the effect is destroyed.

### Changed

- `TimelineScale` on `@nrynss/chaaya/timeline` is an observable and imports
  no framework. `pixelsPerSecond` and `scrollSeconds` keep their names and
  types as getters and setters. A zoom notifies once. A write of the value
  already held does not notify. A Svelte view now wraps the scale:
  `reactive(new TimelineScale())`. Without the wrapper a read renders once
  and never updates.
- `FrameLoop`, `createEventStream`, the core and Keel `JobStream`, and
  `JobPoller` are observables and import no framework. Each notifies once
  per logical change. A kept frame notifies once, even when it also moves
  the cursor and ends the watch. A dropped frame that leaves the cursor
  alone notifies nothing. `events`, `frames`, and the Keel `events` are
  replaced, never mutated, and are typed `readonly`. Their state fields are
  read-only getters now. The wire behaviour, cursor, replay, reset, pause,
  and catch-up rules are unchanged.
- `attach()` on those classes takes no cleanup runner and returns its
  teardown. A Svelte component calls `attach(x)` from
  `@nrynss/chaaya/svelte` instead of `x.attach()`.
- The `svelte` peer range is `^5.7.0`, because the binding uses
  `createSubscriber` from `svelte/reactivity`.
- `AudioPlayer`, `AudioRecorder`, `ClipScheduler`, `PcmStreamPlayer`, and
  `LiveLevel` on `@nrynss/chaaya/audio` are observables and import no
  framework. A Svelte view wraps each one: `reactive(new AudioPlayer())`.
  Their state fields are read-only getters now; `AudioPlayer.rate` keeps
  its setter. List fields (`buffered`, `blocks`, `clips`, `skipped`,
  `chunks`) are readonly and replaced on change, never mutated.
  `AudioPlayer` notifies on the element events that already moved its
  state, and only when a value changed; it adds no timer. A load, a failed
  take, and a finished take each notify once. `LiveLevel` notifies once
  per sample. `ClipScheduler.attach()` returns its teardown. A wrapped
  object notifies for any field, so an effect that reads one re-runs on
  every notification, a recorder's per-block count and countdown included.
  An effect that must run once per state transition reads the field through
  `$derived`, which only passes on a changed value.
- `mediaClock(element)` gains `subscribe(listener)`, which hears the
  element's `timeupdate`, `seeking`, and `seeked` events. `TranscriptClock`
  gains an optional `subscribe`; `AudioPlayer` provides it.
- `ChunkUploader` on `@nrynss/chaaya/keel`, and
  `PricedAction` and `CreditWallet` on `@nrynss/chaaya/priced`, are
  observables and import no framework. A Svelte view wraps each one:
  `reactive(new PricedAction(...))`, and `reactive(wallet.action(...))` for
  an action the wallet makes. Their state fields are read-only getters now.
  Each logical change notifies once: an acknowledgement moves `stored`,
  `acknowledged`, and `pending` together, a failure lands `error` and
  `state` together, and a refresh that lands a new balance and `ready` notifies once. A run that
  settles notifies the wallet only through the refresh it starts.
- `CreditWallet.followTopUp(reference, options)` takes no cleanup runner and
  returns the teardown that stops the follow. Call it from `onMount` or an
  `$effect` and return the teardown, or call it in an event handler and
  keep the teardown. Each top-up answer notifies once. `Uploader` stays a
  plain interface.
- `EditHistory`, `TranscriptEditor`, `TranscriptFollower`, `CameraSession`,
  and `SessionGuard` are observables and import no framework. Their state
  fields are read-only getters, except `EditHistory.serverRevision` and
  `serverDoc` and `TranscriptEditor.reason`, which keep their setters. A
  Svelte view wraps each one: `reactive(new EditHistory(doc))`. Each method
  notifies once, and a no-op notifies nothing. A transaction notifies once,
  when its outermost frame closes. A flush notifies when it starts, on each
  commit answer, and when it ends.
- `EditHistory` replaces `doc`, `entries`, and `proposals` on change instead
  of mutating them, and `entries` and `proposals` are typed `readonly`. `doc`
  is read-only to the caller; change it through `execute`.
- `TranscriptClock.subscribe` is required. `mediaClock` and `AudioPlayer`
  already provide it; a custom clock adds it.
- `TranscriptFollower.follow()` is replaced by `attach()`, which subscribes
  to the clock and the editor, skips a cut the playhead enters or a cut
  made under it, and returns its teardown. Without a framework, nothing
  re-runs a follower that is not attached. The follower notifies only when
  `activeWord` changes. A Svelte component calls `attach(follower)` from
  `@nrynss/chaaya/svelte`.
- `SessionGuard.attach()` returns a teardown that closes the session, the
  same as `destroy()`. A second `attach()` returns the same teardown.
- The `theme` store on `@nrynss/chaaya/theme` is an observable with the
  same `mode`, `resolved`, and `set`. It still reads storage on first use,
  not on import. It notifies once per change of `mode` or `resolved`. A
  Svelte view reads it through `reactive(theme)`. The head script is
  unchanged.
