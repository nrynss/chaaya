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

`JobStream` in `@nrynss/chaaya/core` reads a `text/event-stream`, reconnects when an open stream drops, and publishes one `JobProgress`. The caller passes a `frameMap`. Each event name returns an action:

- `ignore` drops the frame.
- `progress` merges the reading. A field that is present overwrites. A field that is absent stays.
- `terminal` ends the watch. It may also carry a reading and an error.

A name that is not in the map is ignored. The loop, the backoff, and the abort handling stay in core. An adapter ships the map for its backend. An app can ship its own. The error on a terminal action uses the shape in [errors.md](errors.md).

## When not to use this shape

`JobProgress` is only for progress: a step, a counter, a status. An event that is none of those does not belong in `stage`. Publish it on a named event stream (`createEventStream`): any event name, raw data, no progress fields. Progress stays a `JobProgress` reading. Everything else stays a named frame.

## Where the code lives

- Import the type: `import type { JobProgress } from "@nrynss/chaaya/core"`.
- Import the stream: `import { JobStream } from "@nrynss/chaaya/core"`.
- Core does not name stages and does not read a wire format.
- An adapter may map its snapshot into `JobProgress`, and it may ship a `frameMap`. Both stay in the adapter.
- The app maps its domain into `JobProgress` at the edge that publishes or renders progress.
