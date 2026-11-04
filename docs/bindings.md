# Bindings

Chaaya's behaviour is framework-neutral. Every stateful class is an
observable: it keeps its state behind getters and reports each change.
A binding turns that report into one framework's reactivity. Chaaya ships two
bindings, `@nrynss/chaaya/svelte` and `@nrynss/chaaya/react`. Any other
framework, or plain TypeScript, can read the same classes directly.

## The `Observable` contract

`Observable` and its base class `Notifier` live on `@nrynss/chaaya/core`.

```ts
interface Observable {
  subscribe(listener: () => void): () => void
  readonly version: number
}
```

Every Chaaya class keeps these promises.

- **`subscribe(listener)`** calls `listener` after each public state change
  and returns the unsubscribe. The unsubscribe is safe to call twice. On a
  `Notifier`, `subscribe` is bound to its instance, so it can be passed
  around unbound.
- **`version`** increments once per logical change, before any listener
  runs. It is a cheap snapshot key: equal versions mean equal state.
- **One notification per logical change.** A method that moves several
  fields notifies once, after all of them have landed. A write of the value
  already held notifies nothing. Notification is synchronous.
- **State is replaced, never mutated.** An array or object a class publishes,
  such as `frames`, `entries`, or `cuts`, is a new value after a change and
  is typed `readonly`. A binding that compares references sees every change.
- **`attach()` returns its teardown.** A class with a lifetime, such as a
  stream, a poller, or a follower, starts its work in `attach()` and returns
  the function that stops it. Construction touches no browser global, so a
  class can be built during a server render; only `attach()` reaches the
  window.
- **A throwing listener is logged, not rethrown.** The other listeners still
  run, and the change has already landed.

A listener reads the new state from the instance. It gets no argument.

## Svelte

```svelte
<script lang="ts">
  import { attach, reactive } from "@nrynss/chaaya/svelte"
  import { JobStream } from "@nrynss/chaaya/core"
  import { frameMap } from "./frames" // your adapter's frame map

  const job = reactive(new JobStream({ url: "/jobs/42/events", frameMap }))
  attach(job)
</script>

<progress value={job.progress.current} max={job.progress.total}></progress>
```

`reactive(x)` returns a proxy whose reads subscribe the template, effect, or
`$derived` that made them. `attach(x)` runs `x.attach()` in the calling
effect and calls the teardown when the component goes away. A read without
`reactive` renders once and never updates.

A wrapped object notifies for any field, so an `$effect` that reads one field
re-runs on every notification. An effect that must run once per change of
one field reads it through `$derived`, which only passes on a changed value.

## React

```tsx
import { useAttached, useObservable } from "@nrynss/chaaya/react"
import { JobStream } from "@nrynss/chaaya/core"
import { useState } from "react"
import { frameMap } from "./frames" // your adapter's frame map

function Progress() {
  const [job] = useState(() => new JobStream({ url: "/jobs/42/events", frameMap }))
  useObservable(job)
  useAttached(job)
  return <progress value={job.progress.current} max={job.progress.total} />
}
```

`useObservable(x)` is `useSyncExternalStore` with `x.version` as the
snapshot, so one notification is one render and nothing tears. `useAttached(x)`
calls `x.attach()` after mount and runs the teardown on unmount.

Strict Mode in development unmounts and remounts each effect at once.
`FrameLoop`, `JobStream`, `createEventStream`, `JobPoller`, and
`SessionGuard` end for good on their teardown, so `useAttached` waits one
microtask before it runs a teardown. A re-attach of the same target in that
microtask, which is what Strict Mode does, cancels it and keeps the live
attachment. Strict Mode therefore leaves one attachment: one connection, no
state lost, and no close sent by a guard during mount. Components that use
the same target share one attachment, and the last one to unmount tears it
down a microtask later.

A closing target still cannot come back after a real teardown. A component
hidden by `<Activity mode="hidden">` and shown later, for example, finds it
closed. Build a fresh instance for each such lifetime, keyed so the hook sees
a new target.

## Writing a binding

A binding needs two pieces: re-run something when `subscribe` fires, and tie
`attach()` to a lifetime. This is a Vue 3 binding in about 20 lines.

```ts
import { onMounted, onScopeDispose, onUnmounted, shallowRef, triggerRef, type ShallowRef } from "vue"
import type { Observable } from "@nrynss/chaaya/core"

/** A ref whose dependents re-run each time target notifies. */
export function useObservable<T extends Observable>(target: T): ShallowRef<T> {
  const ref = shallowRef(target)
  const stop = target.subscribe(() => triggerRef(ref))
  onScopeDispose(stop)
  return ref
}

/** Attach after mount, tear down on unmount. */
export function useAttached(target: { attach(): () => void }): void {
  let teardown: (() => void) | undefined
  onMounted(() => {
    teardown = target.attach()
  })
  onUnmounted(() => teardown?.())
}
```

Plain TypeScript needs no binding at all:

```ts
const job = new JobStream({ url: "/jobs/42/events", frameMap })
const render = () => {
  bar.value = job.progress.current ?? 0
}
const unsubscribe = job.subscribe(render)
const stop = job.attach()
render()
// Later:
stop()
unsubscribe()
```

The rules for a new binding:

- Subscribe once per reader, and unsubscribe when the reader goes away.
- Use `version` when the framework wants a snapshot. Do not copy the state.
- Call `attach()` where the framework runs side effects, never during a
  server render, and always call the teardown it returns.
- Keep framework imports inside the binding's own directory. The gate fails a
  Svelte or React import anywhere else under `src/lib`.
