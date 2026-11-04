# Snapshot recovery for named SSE

Use an authoritative snapshot when a named-event client must recover after a
broker restart or a cursor falling outside the replay window. A transport
cursor is a delivery hint. It does not prove that the application has every
change.

`createEventStream` already calls `catchUp` once for each successful open,
including the first connection and every reconnect. It reads frames while
that promise is pending. Keep snapshot recovery in that callback, buffer live
changes until the snapshot is installed, and ignore a snapshot from an older
connection. A reset frame clears the transport cursor; it must not start a
second snapshot request.

## The server contract

Register the subscription before making the stream response ready. The
snapshot endpoint must read a coherent state and its application revision.
The following order prevents a change published during setup from falling
between the snapshot and live delivery:

1. Atomically capture replay and register live delivery.
2. Flush the response, with this application-defined reset frame first:

   ```text
   event: reset
   id: 0
   data: {}

   ```

3. Deliver replay and live frames through that registered subscription.
4. When the client sees a successful response, its `catchUp` reads a snapshot
   while incoming frames accumulate in the application buffer.

With Keel, wrap `ServeTopic` so the reset is written at its first flush or
write, after `ServeTopic` has registered the subscription. Writing and
flushing the reset before calling `ServeTopic` creates a readiness gap. The
reset is an application convention, not a frame Keel automatically emits.

Keel's bounded replay only replays when the requested cursor is still in
the topic's ring. An expired or unknown cursor becomes a fresh subscription.
A broker restart also restarts its transport ids; an old numeric id may
even collide with one in the new process. Fetch the authoritative snapshot
on every open rather than guessing from the cursor whether recovery is
needed. The companion contract work is [Keel issue #110](https://github.com/nrynss/keel/issues/110).

## Keep transport ids and application revisions separate

Chaaya uses the SSE `id` for replay filtering and `Last-Event-ID`. Positive
ids at or below the current cursor are dropped. An accepted `id: 0` or
empty `id:` clears it. The reset must be a data event and must pass the
`events` filter. A comment with an id never clears the cursor.

Application state needs its own revision. The example uses `{ epoch,
sequence }`: an epoch identifies the application's state history and a
sequence advances for each change in that history. Both the snapshot and
each change carry it. These values come from the application, not the
broker-wide transport id. A broker restart alone need not change the
application epoch.

Publish application changes in sequence order and preserve that order in
replay and live delivery. The example fails closed on an out-of-order gap;
it does not reorder live changes.

After installing a snapshot, discard buffered changes from other epochs and
changes already covered by its sequence. Apply only contiguous newer
changes in that epoch. A gap means the available changes cannot reconstruct
the state; fetch another authoritative snapshot or report recovery failure.
Never advance the application revision merely because the transport cursor
advanced.

## Executable example

Copy [snapshot-recovery.ts](examples/snapshot-recovery.ts) into your app.
Change its `$lib/core/sse/index.js` import to `@nrynss/chaaya/sse`. It adds no
package API and does not interpret a backend's JSON. The app supplies the
snapshot reader, event decoder, and state updates.

```ts
import { onDestroy } from "svelte"
import { attach } from "@nrynss/chaaya/svelte"
import { createSnapshotRecovery } from "./snapshot-recovery"
import { readSnapshot, decodeChange, applyChange } from "./inbox-contract"

let inbox = $state<Inbox | undefined>(undefined)
let failure = $state<unknown>(undefined)

const recovery = createSnapshotRecovery<Inbox, Change>("/inbox/events", {
  events: ["changed"],
  readSnapshot, // (signal) => Promise<{ epoch, sequence, state: Inbox }>
  decode: decodeChange, // (event) => { epoch, sequence, change: Change }
  replace: (state) => { inbox = state },
  apply: (change) => { inbox = applyChange(inbox!, change) },
  onError: (error) => { failure = error },
})

attach(recovery.stream)
onDestroy(recovery.close)
```

`Inbox`, `Change`, and the functions in `inbox-contract` are the app's
types and validated wire parsers. `readSnapshot` should pass the supplied
`AbortSignal` to its fetch, reject a failed response, and validate the
snapshot body. `decodeChange` should reject malformed changes. Restoring
snapshot state should not replay animations or other effects intended only
for new live changes.

The helper includes `reset` in the allowed names. Its reset handler returns
without fetching. Only `catchUp` starts a snapshot read, so a connection
that also receives a reset still makes one read.

Each `catchUp` synchronously starts a new generation, clears the old
buffer, invalidates the rendered snapshot through `replace(undefined)`, and
aborts the previous snapshot read. A completion may install state only if
its generation is still current and the connection is live. The generation
check remains necessary even when the reader accepts an abort signal:
canceling a request does not guarantee its promise cannot settle later.
Closing the recovery also invalidates pending work.

Changes arriving during the read are buffered. Once the snapshot is
installed, the helper reconciles the buffer against its application revision
and then applies new changes directly. The example bounds that buffer and
closes on overflow, a sequence gap, malformed data, or a current snapshot
failure. A different-epoch live change after snapshot installation also
closes recovery, so an application history change cannot silently leave a
stale view. It reports the error through `onError`; recreate the recovery to
retry. A stale request's failure is ignored. Apps that retry snapshots
within a connection should bound those retries and preserve these same
generation and revision checks.

`catchUp` can also return missed `NamedEvent` values, but an authoritative
snapshot is state, not a list of replay frames. This example installs state
itself and returns no events. In particular, it does not call `prime()` to
set the transport cursor from the snapshot revision.

## Contract checks

[snapshot-recovery.test.ts](../src/lib/core/sse/snapshot-recovery.test.ts)
executes the example against an equivalent in-memory broker fixture. It
models subscription registration before response readiness, reset before
replay/live delivery, bounded replay, and broker id restart. The checks
cover one snapshot per open with reset, publishes during setup, changes
buffered during a snapshot, expired replay cursors, and a superseded
snapshot resolving after a newer connection.

This is a recovery contract fixture, not a run of the Go broker. The
existing pinned Keel wire fixtures remain unchanged.
