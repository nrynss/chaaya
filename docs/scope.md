# What Chaaya covers

Read this before adopting the kit. Chaaya is a Svelte 5 behaviour kit for media apps. It holds the behaviour that is hard to get right and the same in every app. Each app keeps its own look and its own backend. Chaaya is not a backend SDK, and it does not pretend to cover every transport. The list below is the contract. The rest of the docs assume it.

## Streaming

Named SSE over `fetch`. Core splits frames with `takeFrames`, parses them with `parseNamedFrame`, and writes them with `formatNamedFrame`. `FrameLoop` is the only follow loop. There is no WebSocket path. There is no native `EventSource` client. `EventSource` hides a refused status and picks its own retry. This loop does not.

`JobStream` / `createJobStream` map that loop onto a job-shaped stream through a required `frameMap`. `createEventStream` maps the same loop onto arbitrary named events. Neither one builds an HTTP response. On the server, `createJobStreamResponse` on `@nrynss/chaaya/sveltekit` builds the `text/event-stream` response. See [job-stream-response.md](job-stream-response.md).

## Last-Event-ID

The client sends `Last-Event-ID` on reconnect when the last accepted id is not 0. The first connect never sends it. A server may legitimately ignore the header and start from now. That is allowed. The client still sends it so a resume-capable server can pick up.

A kept event frame that carried an id line moves the cursor. An empty `id:` line, or `id: 0`, on a kept event resets it. A comment, including one with an `id:` line, does not move it. That comment rule is a deliberate deviation from WHATWG `EventSource`.

`JobStream` does not drop a repeated id. `createEventStream` drops a positive id at or below its cursor. A backend whose ids restart without an empty `id:` (or `id: 0`) on a kept event loses those frames on the named-event path. Details live in [job-progress.md](job-progress.md).

## Upload

Two HTTP shapes, neither one a storage SDK:

- Chunked and resumable: `Uploader` on `@nrynss/chaaya/core`. An adapter implements `start` / `append` / `finish`. Keel's chunked protocol is one implementation.
- One-shot: `uploadBlob` and `uploadBlobWithProgress` on `@nrynss/chaaya/upload`. The whole body goes in one request. They cannot resume. A short file, or a presigned PUT, belongs here.

A resumable multipart upload straight to object storage is not covered. It is listed under "Not covered yet" below.

## Errors and auth

One typed client failure: `ApiError`. Envelope parsing is the adapter's job through `ApiErrorParser`. Core does not parse a body format. The optional target shape for adapters is `ChaayaError` in [errors.md](errors.md). Writing `frameMap` and `parseError` for a host that is not Keel is [adapters.md](adapters.md).

`GatePasscode` on `@nrynss/chaaya/auth` sends a passcode in a header and a cookie whose names the caller picks. See [auth.md](auth.md). On the server, the form-action helpers on `@nrynss/chaaya/sveltekit` turn an `ApiError` into SvelteKit's `fail()` and `error()` values with the same code. See [form-actions.md](form-actions.md).

## Audio

`@nrynss/chaaya/audio` covers the following.

- Microphone capture in compressed and PCM modes, started from a user gesture. Rate conversion and a WAV writer sit beside it.
- A recording session that moves one take from idle through recording, pause, and upload to done. See [recording-session.md](recording-session.md).
- Playback through one element, unlocked by the first gesture, with seeking and buffered spans. The element is any media element: a caller-owned `<video>` element, or an audio element the player creates.
- `PcmStreamPlayer`, which schedules arriving PCM blocks gaplessly and flushes cleanly.
- Live levels, and waveform peaks computed directly or in a worker.

## Transcript

`@nrynss/chaaya/transcript` holds timed words. `TranscriptEditor` cuts and reverts ranges. A mapping converts between the source timeline and the edited one. Waveform regions come from the cuts. `TranscriptFollower` binds the words to playback. `createTranscriptBridge` folds a timed-word stream into the editor's input. See [transcript-stream.md](transcript-stream.md).

## Session guard

`SessionGuard` on `@nrynss/chaaya/guard` closes one live session exactly once when its page goes away.

## Theme and tokens

`@nrynss/chaaya/tokens` fixes the token role names and checks that a theme block defines every role. Each app supplies the values. `@nrynss/chaaya/theme` is the three-state mechanism (system, forced light, forced dark) with a head script that paints the stored mode before first paint.

## Testing

`@nrynss/chaaya/testing` holds a contrast gate and an accessibility gate. A consumer points them at its own stylesheet and container.

## Framework

Svelte 5 only, for now. The published modules use runes. There is no Svelte 4 build. The SvelteKit helpers sit on their own export, with `@sveltejs/kit` as an optional peer, so Kit is not pulled into every import.

## Not covered yet

These are in scope and tracked as open issues. Until each one lands, an app builds it itself.

- Timed words bound to a video's clock ([#39](https://github.com/nrynss/chaaya/issues/39))
- Timed audio clips scheduled against a media element's clock, for a browser preview of a mix ([#45](https://github.com/nrynss/chaaya/issues/45))
- Timeline geometry and keyboard-operable edit handles ([#40](https://github.com/nrynss/chaaya/issues/40))
- A keyboard shortcut registry that a help view reads ([#41](https://github.com/nrynss/chaaya/issues/41))
- An edit history with undo, redo, and commit reconciliation ([#42](https://github.com/nrynss/chaaya/issues/42))
- A polling job follower that publishes `JobProgress` ([#43](https://github.com/nrynss/chaaya/issues/43))
- A priced action that quotes, confirms, and runs once ([#44](https://github.com/nrynss/chaaya/issues/44))
- Resumable direct-to-storage multipart upload ([#31](https://github.com/nrynss/chaaya/issues/31))

## Out of scope

- WebSocket, native `EventSource`, and any non-fetch stream transport
- A generic backend client that invents routes, event names, or an error envelope
- A UI kit, CSS framework, or visual identity
- Primitives Bits UI already provides, such as dialogs, tooltips, menus, and popovers
- Routing, global state, and authentication screens
- Non-Svelte frameworks

Keel is one adapter on `@nrynss/chaaya/keel`. It is not the definition of the contracts above.
