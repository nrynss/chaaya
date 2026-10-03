# What Chaaya covers

Read this before adopting the kit. Chaaya is a Svelte 5 behaviour kit. It is not a backend SDK, and it does not pretend to cover every transport. The list below is the contract. The rest of the docs assume it.

## Streaming

Named SSE over `fetch`. Core splits frames with `takeFrames`, parses them with `parseNamedFrame`, and writes them with `formatNamedFrame`. `FrameLoop` is the only follow loop. There is no WebSocket path. There is no native `EventSource` client. `EventSource` hides a refused status and picks its own retry. This loop does not.

`JobStream` / `createJobStream` map that loop onto a job-shaped stream through a required `frameMap`. `createEventStream` maps the same loop onto arbitrary named events. Neither one builds an HTTP response. The host sets `Content-Type: text/event-stream`.

## Last-Event-ID

The client sends `Last-Event-ID` on reconnect when the last accepted id is not 0. The first connect never sends it. A server may legitimately ignore the header and start from now. That is allowed. The client still sends it so a resume-capable server can pick up.

A kept event frame that carried an id line moves the cursor. An empty `id:` line, or `id: 0`, on a kept event resets it. A comment, including one with an `id:` line, does not move it. That comment rule is a deliberate deviation from WHATWG `EventSource`.

`JobStream` does not drop a repeated id. `createEventStream` drops a positive id at or below its cursor. A backend whose ids restart without an empty `id:` (or `id: 0`) on a kept event loses those frames on the named-event path. Details live in [job-progress.md](job-progress.md).

## Upload

Two HTTP shapes, neither one a storage SDK:

- Chunked and resumable: `Uploader` on `@nrynss/chaaya/core`. An adapter implements `start` / `append` / `finish`. Keel's chunked protocol is one implementation.
- One-shot: `uploadBlob` and `uploadBlobWithProgress` on `@nrynss/chaaya/upload`. The whole body goes in one request. They cannot resume. A short file, or a presigned PUT, belongs here.

There is no resumable direct-to-storage multipart helper yet. A later one should reuse the shared prepare / refusal / progress path documented in [upload.md](upload.md), not a second copy of the request.

## Errors

One typed client failure: `ApiError`. Envelope parsing is the adapter's job through `ApiErrorParser`. Core does not parse a body format. The optional target shape for adapters is `ChaayaError` in [errors.md](errors.md). Writing `frameMap` and `parseError` for a non-Keel host is [adapters.md](adapters.md).

## Framework

Svelte 5 only, for now. The published modules use runes. There is no Svelte 4 build. Optional SvelteKit helpers (form actions, and a future server SSE response helper) sit beside the core client and do not pull Kit into every import.

## Out of scope

- WebSocket, native `EventSource`, and any non-fetch stream transport
- A generic backend client that invents routes, event names, or an error envelope
- Resumable direct-to-storage multipart (presigned one-shot PUT is already covered)
- A UI kit, CSS framework, or visual identity
- Non-Svelte frameworks

Keel is one adapter on `@nrynss/chaaya/keel`. It is not the definition of the contracts above.
