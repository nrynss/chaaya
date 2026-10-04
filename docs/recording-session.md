# Recording session

`createRecordingSession` is a headless take controller. It does not render, and it does not know Keel or a product backend.

The phase table lives in `src/lib/audio/session/phase.ts`. A move the phase does not allow leaves the phase alone. The controller turns that into a thrown `RecordingSessionError` for commands, so a click handler can tell a refused pause from a pause that happened.

| From | Command | To |
| --- | --- | --- |
| `idle` | `start` | `recording` |
| `recording` | `pause` | `paused` |
| `paused` | `resume` | `recording` |
| `recording` or `paused` | `stop` | `uploading`, then `done` |
| `recording`, `paused`, or `uploading` | `cancel` | `cancelled` |
| open phases (`idle` through `uploading`) | failure | `failed` |
| any | `reset` | `idle` |

`failed` and `cancelled` are terminal, same as `done`. Only `reset` starts another take.

## Wiring

```ts
import { AudioRecorder, captureFromRecorder, createRecordingSession } from "@nrynss/chaaya/audio"
import { uploadBlob } from "@nrynss/chaaya/upload"

const recorder = new AudioRecorder({ mode: "compressed" })
const session = createRecordingSession({
  capture: captureFromRecorder(recorder),
  upload: {
    send: async (result, signal) => {
      await uploadBlob("/takes", result.blob, {
        signal,
        filename: "take.webm",
        headers: { authorization: `Bearer ${token}` },
      })
    },
  },
})

await session.start()
await session.stop()
```

Call `start` from a user gesture. The recorder opens the microphone, and the browser grants capture from that gesture. The session does not.

`uploadBlob` is the one-shot helper. A chunked upload implements the same `send(result, signal)` port with an `Uploader` instead. The session never imports either one.

## Pause

`AudioRecorder` cannot pause. Its own table is `idle → requesting → recording → stopped`, plus `denied` and `failed`. `captureFromRecorder` therefore omits `pause` and `resume`. `session.pause()` throws `pause_unsupported` and the phase stays `recording`.

A capture port that can hold a take implements both methods. The session then moves `recording → paused → recording`. Do not fake a pause by stopping the recorder: that ends the take and drops the clock the PCM blocks are aligned on.

## Grant, cancel, empty

The phase stays `idle` while `start` waits on the microphone. Another `start` in that window throws `busy`. `cancel` in that window lands on `cancelled`. The public table has no cancel from `idle`, because the grant has not entered `recording` yet. The controller still owes a terminal phase, and it records that exception in one place.

`AudioRecorder.start` resolves on a refused grant instead of throwing, with `state` `denied` and `error` set. The session treats "resolved but not `recording`" as `failed` and keeps that error.

`start` must settle after `reset`. The session cannot cancel `getUserMedia` itself. `AudioRecorder.reset` does settle the in-flight start. A late grant is reset again so the device does not stay open.

A stop that produces no `CaptureResult` (a PCM take with `retain: false` is the usual case) fails with `empty_take` and does not call upload. Stream those blocks with `onChunk` if there is no file to send. A failed upload keeps `session.result` so the caller can retry after `reset` without recording again only if they still hold the blob. `reset` clears it.

`stop` publishes `uploading` before the recorder finishes, then publishes again once `result` holds the blob and before `send`. A listener can see `uploading` twice. The second call is the retained take, not a new phase. `stop` rejects with `RecordingCancelled` when `cancel` or `reset` wins. Upload must honour the `AbortSignal`. A send that resolves after the abort is ignored, and the phase stays on the winner.
