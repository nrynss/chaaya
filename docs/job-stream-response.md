# Job stream response

`createJobStreamResponse` on `@nrynss/chaaya/sveltekit` builds a `text/event-stream` `Response` from an iterable of frames. A SvelteKit `+server.ts` returns it. A browser `JobStream` or `createEventStream` follows it. The helper does not import Keel and does not invent event names.

Frames are `NamedFrameFields` (`event`, optional `id` and `data`, or a `comment`), or strings already written by `formatNamedFrame`. Pass `request.signal` so a dropped tab stops the writer.

This is not a UI. There is no component and no CSS.

## `+server.ts`

```ts
import { createJobStreamResponse } from "@nrynss/chaaya/sveltekit"
import type { RequestHandler } from "./$types"

async function* watch(jobId: string) {
  yield { id: 1, event: "progress", data: JSON.stringify({ step: "encode", done: 0, of: 2 }) }
  // ... await real work ...
  yield { id: 2, event: "progress", data: JSON.stringify({ step: "encode", done: 2, of: 2, result: "/out.bin" }) }
  yield { id: 3, event: "done", data: "{}" }
}

export const GET: RequestHandler = ({ params, request }) => {
  return createJobStreamResponse(watch(params.id), { signal: request.signal })
}
```

The page opens a `JobStream` with a `frameMap` for those event names. The complete adapter, including writers, is [adapters.md](adapters.md).

## Headers

`content-type` is always `text/event-stream`. `cache-control` defaults to `no-cache`. Pass `headers` to add others, or to replace `cache-control`. A caller's `content-type` does not stick.

## Abort

When `signal` aborts, the stream closes and no further frames are written. Pass `request.signal` from the request handler so a dropped connection stops the work. A signal that is already aborted yields an empty body. A client that cancels the body also stops further writes, even when no signal was passed. The iterable itself stops only at its next frame unless it watches that signal.

## What this is not

- Not a WebSocket server
- Not an `EventSource` polyfill
- Not a Keel job runner
- Not a replacement for `formatNamedFrame` on a non-SvelteKit host. Call the writer and set the headers yourself there

Protocol limits are [scope.md](scope.md).
