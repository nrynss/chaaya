# Migrating from 0.5 to 0.6

0.6.0 makes Chaaya's behaviour framework-neutral. Every stateful class is
now an observable on `@nrynss/chaaya/core`, and Svelte reaches it through a
binding, `@nrynss/chaaya/svelte`. A React binding,
`@nrynss/chaaya/react`, sits beside it. This guide lists every public
signature that changed between `api/0.5.0` and 0.6.0, and what a Svelte app
changes for each.

## The silent failure: wrap every instance a view reads

In 0.5 a class held its state in runes, so a template that read a field
updated by itself. In 0.6 the class holds plain private state and notifies.
**A class read without `reactive()` renders once and never updates.** Nothing
throws and nothing warns, so check every construction a view reads.

```svelte
<!-- 0.5 -->
<script lang="ts">
  import { AudioPlayer } from "@nrynss/chaaya/audio"
  const player = new AudioPlayer()
</script>

<!-- 0.6 -->
<script lang="ts">
  import { AudioPlayer } from "@nrynss/chaaya/audio"
  import { reactive } from "@nrynss/chaaya/svelte"
  const player = reactive(new AudioPlayer())
</script>
```

This applies to `AudioPlayer`, `AudioRecorder`, `ClipScheduler`,
`PcmStreamPlayer`, `LiveLevel`, `FrameLoop`, `createEventStream`, both
`JobStream` classes, `JobPoller`, `ChunkUploader`, `PricedAction`,
`CreditWallet` and the actions it makes, `EditHistory`, `TranscriptEditor`,
`TranscriptFollower`, `CameraSession`, `SessionGuard`, `TimelineScale`, and
the `theme` store. The `theme` store is a shared instance, so wrap it where
you import it:

```ts
import { theme as themeStore } from "@nrynss/chaaya/theme"
import { reactive } from "@nrynss/chaaya/svelte"
const theme = reactive(themeStore)
```

`reactive` notifications are coarse. A wrapped object notifies for any field,
so an `$effect` that reads one field re-runs on every notification, a
recorder's per-block count and countdown included. An effect that must run
once per change of one field reads it through `$derived`:

```ts
const recorderState = $derived(recorder.state)
$effect(() => {
  if (recorderState === "stopped") save()
})
```

## `attach()` returns its teardown

In 0.5, `attach()` took an optional cleanup runner and registered its
teardown in the calling Svelte effect. In 0.6 it takes nothing and returns
the teardown. In a component, use `attach` from the binding, which runs the
call in an effect and tears it down with the component:

```svelte
<!-- 0.5 -->
<script lang="ts">
  const stream = new JobStream(options)
  stream.attach()
</script>

<!-- 0.6 -->
<script lang="ts">
  import { attach, reactive } from "@nrynss/chaaya/svelte"
  const stream = reactive(new JobStream(options))
  attach(stream)
</script>
```

Outside a component, keep the teardown and call it yourself:

```ts
const stop = stream.attach()
// Later:
stop()
```

| Signature in 0.5 | Signature in 0.6 |
|---|---|
| `FrameLoop.attach(registerCleanup?): void` | `FrameLoop.attach(): () => void` |
| `EventStream.attach(registerCleanup?): void` | `EventStream.attach(): () => void` |
| `JobStream.attach(registerCleanup?): void` (core and Keel) | `JobStream.attach(): () => void` |
| `JobPoller.attach(registerCleanup?): void` | `JobPoller.attach(): () => void` |
| `ClipScheduler.attach(): void` | `ClipScheduler.attach(): () => void` |
| `SessionGuard.attach(): void` | `SessionGuard.attach(): () => void`, a teardown that runs `destroy()` |
| `CreditWallet.followTopUp(reference, options, registerCleanup?): void` | `CreditWallet.followTopUp(reference, options): () => void` |

`followTopUp` is often called from an event handler. Keep its teardown and
call it from `onDestroy`, or call it from `onMount` and return the teardown.

A React component calls `useAttached(x)` from `@nrynss/chaaya/react`. It
keeps a closing target, such as a `FrameLoop`, alive through Strict Mode's
development remount; see [bindings.md](bindings.md#react).

## `TranscriptFollower.follow()` becomes `attach()`

```svelte
<!-- 0.5 -->
<script lang="ts">
  const follower = new TranscriptFollower(editor, player)
  follower.follow()
</script>

<!-- 0.6 -->
<script lang="ts">
  import { attach, reactive } from "@nrynss/chaaya/svelte"
  const follower = reactive(new TranscriptFollower(editor, player))
  attach(follower)
</script>
```

In 0.5, `follow()` relied on a Svelte effect tracking `clock.currentTime`.
In 0.6 the follower subscribes to the clock and the editor while attached.
It skips a cut the playhead enters, or a cut made under a resting playhead,
and notifies only when `activeWord` changes. A follower that is not attached
reads `activeWord` live but notifies nothing and skips nothing.

## `TranscriptClock.subscribe` is required

```ts
interface TranscriptClock {
  currentTime: number
  seek(seconds: number): void
  subscribe(listener: () => void): () => void // new in 0.6
}
```

`AudioPlayer` and `mediaClock(element)` provide it; `mediaClock` listens to
the element's `timeupdate`, `seeking`, and `seeked` events and starts no
timer. A hand-written clock adds `subscribe`, calling the listener on every
position change, seeks included.

## Fields are read-only getters

Every public state field is now a getter. Assigning to one is a type error,
and at runtime the write throws a `TypeError`, because module code runs in
strict mode. Change state through the class's methods. These fields keep a
setter: `AudioPlayer.rate`, `TimelineScale.pixelsPerSecond` and
`scrollSeconds`, `TranscriptEditor.reason`, and `EditHistory.serverRevision`
and `serverDoc`.

| Class | Fields that became read-only getters |
|---|---|
| `FrameLoop` | `connection`, `reconnects`, `lastEventId`, `lastComment` |
| `JobStream` (core) | `progress`, `error`, `frames` |
| `JobPoller` | `progress`, `error`, `connection` |
| `ChunkUploader` | `state`, `id`, `capturedBytes`, `acknowledged`, `pending`, `retries`, `stored`, `receipt`, `error` |
| `AudioPlayer` | `playing`, `currentTime`, `duration`, `buffered`, `error`, `lastPlayError`, `source`, `recoveries` |
| `AudioRecorder` | `state`, `countdown`, `chunkCount`, `result`, `error` |
| `PcmStreamPlayer` | `blocks`, `lastCut` |
| `ClipScheduler` | `clips`, `skipped` |
| `LiveLevel` | `rmsDb`, `peakDb` |
| `PricedAction` | `phase`, `quote`, `result`, `error`, `insufficient` |
| `CreditWallet` | `balance`, `phase`, `error` |
| `EditHistory` | `doc`, `status`, `conflict`, `lastError`, `proposals`, `entries` |
| `TranscriptEditor` | `cuts`, `anchor`, `focus` |
| `CameraSession` | `phase`, `facing`, `reason` |
| `SessionGuard` | `closed` |
| `theme` | `mode`, `resolved` (already read-only) |

`EditHistory.doc` is read-only to the caller. Change the document through
`execute`, so the change can be undone and synced.

## Lists are `readonly` and replaced

A list a class publishes is replaced on every change and never mutated, and
its type is `readonly`. Code that pushed into one, sorted it in place, or
held a reference expecting it to grow must copy it instead.

| Class | Field | 0.5 type | 0.6 type |
|---|---|---|---|
| `EventStream` | `events` | `NamedEvent[]` | `readonly NamedEvent[]` |
| `JobStream` (core) | `frames` | `NamedEvent[]` | `readonly NamedEvent[]` |
| `JobStream` (Keel) | `events` | `JobEvent[]` | `readonly JobEvent[]` |
| `AudioPlayer` | `buffered` | `BufferedSpan[]` | `readonly BufferedSpan[]` |
| `PcmStreamPlayer` | `blocks` | `ScheduledBlock[]` | `readonly ScheduledBlock[]` |
| `ClipScheduler` | `clips`, `skipped` | `TimedClip[]`, `string[]` | `readonly TimedClip[]`, `readonly string[]` |
| `EditHistory` | `proposals`, `entries` | mutable arrays | `readonly` arrays |
| `TranscriptEditor` | `cuts` | `TranscriptCut[]` | `readonly TranscriptCut[]` |

```ts
// 0.5
const sorted = editor.cuts.sort(byStart)
// 0.6
const sorted = [...editor.cuts].sort(byStart)
```

## Every class extends `Notifier`

Each class above now `extends Notifier`, and `EventStream` extends
`Observable`. Each gains `subscribe(listener)`, which returns the
unsubscribe, and `version`, which increments once per change. Plain
TypeScript and other frameworks read changes through these. See
[bindings.md](bindings.md).

`Notifier`, `Observable`, and `Listener` are new exports on
`@nrynss/chaaya/core`.

## Packaging

- `@nrynss/chaaya/svelte` and `@nrynss/chaaya/react` are new entries.
- Only `./svelte` and `./sveltekit` carry the `svelte` export condition.
  Every other entry resolves through `default`.
- `svelte`, `bits-ui`, and `react` are optional peers. A Svelte app keeps
  `svelte` installed at `^5.7.0`; the Svelte binding needs `createSubscriber`.
- Module files dropped the `.svelte` infix, for example
  `dist/core/sse/loop.svelte.js` is now `dist/core/sse/loop.js`. Import from
  the package entries, never from a `dist` path.

## Checklist

1. Wrap every Chaaya instance a view reads in `reactive(...)`, the `theme`
   store included.
2. Replace `x.attach()` in a component with `attach(x)`, and
   `follower.follow()` with `attach(follower)`.
3. Keep the teardown that `followTopUp` returns.
4. Add `subscribe` to any hand-written `TranscriptClock`.
5. Remove assignments to read-only fields, and copy a published list before
   changing it.
6. Read a field through `$derived` in an effect that must run once per
   change of that field.
