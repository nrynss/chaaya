# Job progress

`JobProgress` is the reading a view renders for long-running work. The type lives in `@nrynss/chaaya/core`. It lists no event names and no terminal set.

Core does not map a wire format. An adapter maps its backend snapshot onto this shape. An app maps its own domain onto the same shape. Both mappings stay outside core.

## Fields

| Field | Meaning |
| --- | --- |
| `id` | The job, when the producer named one. Omit it when there is no id. |
| `stage` | The step the job is on. Any string the app chooses. |
| `current` | Work done so far, in the one counter the view cares about. |
| `total` | How much that counter totals. |
| `status` | A freeform status string. Core does not decide which strings are terminal. |
| `detail` | Payload only the app reads: a URL, a nested counter, or any other value. |

Every field is optional.

`id` stays optional on purpose. A backend that does not assign job ids omits it. Core never invents one, and an adapter should not invent one either.

`status` is not an enum. Apps often use `pending` or `queued`, then `running`, `done`, and `error`. Nothing in core requires that set. A reading ends the job only when the caller says so: `isTerminal` on a catch-up, or a `terminal` action from the `frameMap`.

## Stage list

Keep the ordered stage names in the app. Publish `current` and `total` as the index in that list.

```ts
const stages = ["prepare", "encode", "finish"]
const reading: JobProgress = {
  id: "job-1",
  stage: stages[1],
  current: 1,
  total: stages.length,
  status: "running",
}
```

That reading is stage `encode`, step 1 of 3.

When one stage has a finer counter, put that counter in `current` and `total`. Keep the outer index in `detail` if the view still needs it. Do not put two units in `current` at once.

```ts
const reading: JobProgress = {
  id: "job-1",
  stage: "encode",
  current: 3,
  total: 12,
  status: "running",
  detail: { stageIndex: 1, stageCount: 3 },
}
```

Here the view shows page 3 of 12 inside `encode`. `detail` still says this is stage 1 of 3.

## Payload on the last progress reading

Put the app result in `detail` on the last progress reading, while the work is still reporting progress. A later terminal frame stays thin: an id and a status are enough. Do not make that frame the only place the result exists. A view that renders `JobProgress` can show the payload from the last reading without learning a second event vocabulary.

```ts
const reading: JobProgress = {
  id: "job-1",
  stage: "encode",
  current: 12,
  total: 12,
  status: "running",
  detail: { url: "/media/out.bin", bytes: 48000 },
}
```

## Upload

Bytes, or parts, can be the counter. The stage name is whatever the app calls that step.

```ts
const reading: JobProgress = {
  id: "up-9",
  stage: "upload",
  current: 2,
  total: 5,
  status: "running",
}
```

When the upload has finished its progress, the last reading can carry the stored location in `detail`. The terminal frame stays thin.


## Following a stream

The follow loop is `FrameLoop` in core. It fetches the stream, splits frames with `takeFrames`, parses them with `parseNamedFrame`, reconnects, and aborts. `onFrame` receives only event frames (`kind: "event"`). A comment never arrives there, so a projection returns nothing for it. Comments set `lastComment` and call `onComment`. `JobStream` only applies `frameMap`. An adapter does not write that loop again.

`JobStream` and `createJobStream` are the same stream. `createJobStream(options)` returns `new JobStream(options)`. Adapters and apps may use either. Both take the same options. `frameMap` is required.

Import them from `@nrynss/chaaya/core`:

```ts
import { JobStream, createJobStream } from "@nrynss/chaaya/core"
```

Each event name in the map returns an action:

- `ignore` drops the frame.
- `progress` merges the reading. A field that is present overwrites. A field that is absent stays.
- `terminal` ends the watch. It may also carry a reading and an error.

A name that is not in the map is ignored. `frameMap` is a plain object's own keys. The loop uses `Object.hasOwn`, so an event named `toString` or `constructor` does not call an inherited function and does not end the watch. A handler result whose `kind` is not `ignore`, `progress`, or `terminal` is ignored the same way. Optional hooks stay on the options, not in a second loop:

- `shouldAccept` refuses a frame before the map runs. It does not mean the frame was kept.
- `onAccept` runs only after a `progress` or `terminal` action. Use it to record the frame. An ignore does not call it.
- `fetchState` reads a catch-up once the stream is live, so a late join can catch up. It resolves `{ reading, error? }`. `reading` is a `JobProgress`. `error` is a `ChaayaError` beside that reading. Do not put the failure in `reading.detail`.
- `prepareState` may rewrite that catch-up, or return undefined to skip it.
- `isTerminal` says whether that catch-up reading ends the watch. It sees the progress reading, not the error.
- `requestInit` adds fetch fields, usually `headers` and `credentials`, so an adapter can pass auth without a second loop.

`Accept` is always `text/event-stream`. A different `accept` on `requestInit` does not stick. `signal` on `requestInit` is ignored. The stream owns the abort.

The first request sends no `Last-Event-ID`. A reconnect sends it when the last accepted id is not 0. An accepted frame with no id line leaves that id alone. An empty id line (`id:`) on an accepted frame resets it, and the next reconnect omits the header. An explicit `id: 0` does the same. An ignored frame does not move that id. Comment frames, including Keel heartbeats, never reach `onFrame` or `frameMap`. `onComment` receives the comment text, a string. `FrameLoop` and `createEventStream` use that same argument. An `id:` on a comment does not move the cursor. That is a deliberate deviation from WHATWG. `EventSource` sets last-event-ID from the `id:` field before it checks whether the data buffer is empty, so a comment that carries `id:` still advances the cursor. This loop does not. Only a kept event frame moves it.

Ids are assumed to strictly climb. A backend whose ids restart or repeat must send an empty `id:` line, or an explicit `id: 0`, on a frame the client keeps. That is the reset. If the ids restart without it, the client treats the new frames as replays and drops them with no error. The failure mode is a silent drop. The fix is that empty `id:` line (or `id: 0`) before the ids climb again.

The error on a terminal action uses the shape in [errors.md](errors.md).

### Another backend

A Rust server, or any other server that speaks `text/event-stream`, does not get its own client loop. The page imports `JobStream` or `createJobStream` and supplies a map for that server's event names. Reconnect and abort stay options on the same call.

```ts
import { createJobStream, type JobFrameAction, type NamedEvent } from "@nrynss/chaaya/core"

function onFrame(frame: NamedEvent): JobFrameAction {
  const data = JSON.parse(frame.data) as {
    stage?: string
    current?: number
    total?: number
  }
  if (frame.name === "done") return { kind: "terminal", reading: { status: "done" } }
  if (frame.name === "error") {
    return {
      kind: "terminal",
      reading: { status: "error" },
      error: { code: "failed", message: "stopped" },
    }
  }
  return {
    kind: "progress",
    reading: {
      stage: data.stage,
      current: data.current,
      total: data.total,
      status: "running",
    },
  }
}

const stream = createJobStream({
  url: "/jobs/1/events",
  reconnect: { baseMs: 500, maxMs: 8000, attempts: 6 },
  frameMap: {
    progress: onFrame,
    done: onFrame,
    error: onFrame,
  },
})
stream.attach()
```

`new JobStream({ url, frameMap, reconnect })` is the same call. The example names `progress`, `done`, and `error` only. It does not reimplement fetch, frame splitting, or backoff.

## When not to use this shape

`JobProgress` is only for progress: a step, a counter, a status. An event that is none of those does not belong in `stage`. Publish it as named SSE frames instead: any event name, raw data, no progress fields. Progress stays a `JobProgress` reading. Everything else stays a named frame.

`createEventStream` follows that stream. It sits on the same `FrameLoop` as `JobStream`. It does not copy the read loop. The transport is named SSE over `fetch`. It is not `EventSource`, which hides a refused status and picks its own retry. There is no WebSocket path.

Ids are assumed to strictly climb. A positive id less than or equal to the cursor is a replay and is dropped. An empty `id:` line resets the cursor to 0, so the next positive id is new. An explicit `id: 0` does the same. A frame with no id line is kept and does not move the cursor. The first connect sends no `Last-Event-ID`, even after `prime()`. A reconnect sends it when the cursor is not 0. A comment frame, such as a heartbeat, sets `lastComment` and calls `onComment` with the comment text. That argument is a string on `createEventStream` and on `FrameLoop`. It does not call `onFrame`, it is not an event, and it does not move the cursor. An `id:` on that comment leaving the cursor alone is a deliberate deviation from WHATWG. `EventSource` would advance last-event-ID before the empty-data check. A backend whose ids restart or repeat must send an empty `id:` line, or `id: 0`, on a kept event. Otherwise the restarted frames are dropped in silence. That silent drop is the failure mode. The empty `id:` line is the fix. A terminal name that is absent from the `events` filter can never stop the stream, because the filter refuses the frame before the terminal check runs. `prime()` with a terminal event closes the stream before `attach()`, so `attach()` then connects nothing.

This example is an inbox, not a job and not a product adapter. The server can be anything that writes `text/event-stream`.

```ts
import { createEventStream, FrameBuffer } from "@nrynss/chaaya/sse"

const messages: { name: string; data: string }[] = []
let heartbeat = ""
const buffer = new FrameBuffer()
const stream = createEventStream("/inbox/events", {
  headers: { authorization: "Bearer t" },
  requestInit: { credentials: "include" },
  events: ["message", "closed"],
  terminal: ["closed"],
  onComment: (comment) => {
    heartbeat = comment
  },
  onFrame: (event) => {
    messages.push({ name: event.name, data: event.data })
  },
})
stream.prime(buffer.drain())
stream.attach()
```

`FrameBuffer` is only a list of frames captured before the page exists. The name is not a product topic.

## Where the code lives

- Import the type: `import type { JobProgress } from "@nrynss/chaaya/core"`.
- Import the stream: `import { JobStream, createJobStream } from "@nrynss/chaaya/core"`.
- The follow loop is `FrameLoop`. `JobStream` supplies `frameMap`, and it may supply `shouldAccept`, `onAccept`, `isTerminal`, `fetchState`, `prepareState`, and `requestInit`. A catch-up is `{ reading, error? }`. The error is not a field of the reading.
- Named events that are not progress use `createEventStream` from `@nrynss/chaaya/sse` (also exported from core). That helper does not reimplement the loop.
- Core does not name stages and does not read a wire format.
- An adapter may map its snapshot into `JobProgress`. That mapping stays in the adapter.
- The app maps its domain into `JobProgress` at the edge that publishes or renders progress.
