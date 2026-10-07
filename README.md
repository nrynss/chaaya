# Chaaya

> **Chaaya** (ഛായ): likeness, shade.

A Svelte 5 kit of behaviour, not looks. Each app that uses it keeps its own
visual identity. Chaaya supplies the parts that are hard to get right and the
same in every app.

Chaaya is a kit, not a backend SDK. A product's wire contract does not live in
the generic modules. Keel is one adapter, at `@nrynss/chaaya/keel`. An app that
is not Keel does not import it. Nothing in this package names a consumer app.

## Scope

- **Theme tokens.** A fixed set of role names and the three-state theme
  mechanism (system, forced light, forced dark). Each app supplies its own
  values.
- **Audio.** Microphone capture and playback with seeking. Live levels and
  waveform peaks.
- **Server-sent events.** A frame reader, a frame writer, and a reconnect
  schedule that keep whatever event name the server sent. `FrameLoop` is the
  only follow loop. `JobStream` maps that loop onto progress. `createEventStream`
  maps it onto named events. The writer emits a frame string. It does not
  build an HTTP response. The transport is fetch, not `EventSource`, and there
  is no WebSocket path.
- **API client.** One fetch wrapper. A failed response is a typed error. The
  caller supplies a parser when a backend has an error envelope. Timeout and
  network failures are generic.
- **Upload.** Chunked and resumable through an adapter's `Uploader`, or one
  shot with socket progress. A presigned PUT is a one-shot upload.
- **Recording and transcript.** A headless recording session, timed words
  with cuts, and a follower that binds words to playback.
- **SvelteKit.** Form-action mappers for typed errors, and an event-stream
  response for `+server.ts`.
- **Gates.** A contrast gate and an accessibility gate an app runs on itself.
- **No widget.** Core imports no stylesheet and no visual component. ESLint
  fails either import inside `src/lib/core`.

Accessible primitives such as dialogs and tooltips come from
[Bits UI](https://bits-ui.com), not from this package.

## Protocol scope

What the kit covers, and what it does not:

- **Streaming:** named SSE over `fetch`. Reader/writer in core. No WebSocket.
  No native `EventSource`.
- **Job loop:** `JobStream` for a job-shaped stream. `createEventStream` for
  arbitrary named events. Both sit on `FrameLoop`.
- **Last-Event-ID:** sent on reconnect when the cursor is not 0. A server may
  ignore it and start from now.
- **Upload:** chunked `Uploader` (adapter) and one-shot `uploadBlob`.
  Resumable direct-to-storage multipart is not covered yet.
- **Errors:** one typed `ApiError`. Envelope parsing is the adapter's
  (`ApiErrorParser`).
- **Framework:** Svelte 5 only, for now.
- **Not covered yet:** a timeline, shortcuts, undo and redo, polling, and
  priced actions. Each is an open issue, listed in the written page.

The written page is [docs/scope.md](docs/scope.md).

Published as `@nrynss/chaaya`.

## Exports

- `@nrynss/chaaya`: the package name.
- `@nrynss/chaaya/core`: the generic contracts. `ApiClient`, the parse
  helpers (`ok`, `fail`, `isRecord`, `decodeJson`) for adapter authors, the
  `SseFrame` reader and `formatNamedFrame` writer, `JobStream` and
  `createJobStream` with a required `frameMap`. `requestInit` carries
  auth. A reconnect sends `Last-Event-ID` when the last accepted id is
  not 0. An empty `id:` line resets that id. A frame with no id line
  leaves it. Also the `JobProgress` shape, `ChaayaError`, and the chunked
  `Uploader` interface. No backend envelope, event names, or upload
  protocol. One-shot upload is not `Uploader`.
- `@nrynss/chaaya/tokens`: the fixed role names and a checker that reports a
  role a theme block leaves out.
- `@nrynss/chaaya/tokens/reference.css`: the reference stylesheet a new app
  copies.
- `@nrynss/chaaya/theme`: the three-state theme mechanism and the head
  script that paints the stored mode before first paint.
- `@nrynss/chaaya/api`: the fetch client. Pass `parseError` to read a
  backend's envelope. Without a parser, a non-2xx body stays `http_error`.
  `createApi({ parseError })` sets that parser for every call.
- `@nrynss/chaaya/auth`: `GatePasscode` sends a caller-named header and cookie.
  It has no backend default names. `GateError` extends `ApiError`.
  `instanceof GateError` marks an auth refusal. `authCodes` is a plain list
  checked with `includes`, so a prototype key is not an auth code.
  `Set-Cookie` is read only where the runtime still exposes it (Node, undici).
  Browsers hide that header. The branch stays for callers that need it.
  Pass `jar: document` only in the browser. Omit it under SSR. Importing the
  module does not touch `document`. `apply({})` leaves `credentials` unset.
  Pass `credentials: "include"` to opt in. Keel's adapter is `keelGate` on
  `@nrynss/chaaya/keel`, and `src/lib/adapters/keel/gate.ts` is the reference
  shape. The adapter guide is [Writing an adapter](#writing-an-adapter).
- `@nrynss/chaaya/sveltekit`: form-action mappers for `ApiError`, and
  `createJobStreamResponse` for a `text/event-stream` `+server.ts`. Optional
  `@sveltejs/kit` peer.
- `@nrynss/chaaya/sse`: the shared frame splitter, named-event field parser,
  `formatNamedFrame` writer, reconnect schedule, and `FrameLoop`. Payloads are
  not interpreted. The writer emits a frame string. It does not build a
  response. `createEventStream` follows arbitrary named events on that loop.
  It is not a job client. Ids are assumed to strictly climb. A replay at or
  below the cursor is dropped. An empty `id:` line, or `id: 0`, on a kept
  event resets the cursor. A backend whose ids restart without that reset
  loses the new frames: they are dropped in silence. `Last-Event-ID` is sent
  only on reconnect, and only when that cursor is not 0. Comment frames set
  `lastComment` and do not call `onFrame`. The first connect does not send
  `Last-Event-ID`.
- `@nrynss/chaaya/upload`: `uploadBlob` (fetch, one progress call after
  settle) and `uploadBlobWithProgress` (XMLHttpRequest, socket progress).
  Neither is on `@nrynss/chaaya/core`. `credentials` is one option.
  XMLHttpRequest maps `"include"` to `withCredentials`, which only affects
  cross-origin requests. `credentials: "omit"` and `formData: false` are the
  presigned PUT. `maxBytes` applies to a blob. On `FormData` it throws unless
  you pass `size`. This is not `Uploader` and it is not audio-specific.
- `@nrynss/chaaya/audio`: microphone capture in compressed and PCM modes,
  playback through one media element, audio or video, unlocked by the first
  gesture, the PcmStreamPlayer for arriving blocks, and live levels and
  waveform peaks. Capture adds the resampleLinear and resampleChunks rate
  conversion and the encodeWav file writer.
- `@nrynss/chaaya/guard`: the SessionGuard that closes one live session
  exactly once when its page goes away.
- `@nrynss/chaaya/transcript`: timed words, the TranscriptEditor that cuts and
  reverts ranges over them, the mapping between the source and edited
  timelines, the waveform regions derived from the cuts, and the
  TranscriptFollower that binds the words to playback.
- `@nrynss/chaaya/timeline`: seconds to pixels under zoom and scroll with
  ruler ticks, segment move and resize against snap targets, and the handle
  that turns any element into a keyboard operable edge or body control.
- `@nrynss/chaaya/testing`: a contrast gate and an accessibility gate a
  consumer points at its own stylesheet and container, plus protocol asserts
  an adapter author points at its frames, errors, and readings.
- `@nrynss/chaaya/keel`: the Keel adapter, checked against Keel `v0.4.0`.
  It holds the error envelope, job event parser, `keelFrameMap`, a
  pre-wired `JobStream` wrapping core with `keelFrameMap`, and the chunked
  upload protocol. The follow loop stays in core. Its `api` is the generic
  client with Keel's envelope parser already set. It is one adapter, not the
  contract. See [Writing an adapter](#writing-an-adapter).

## Writing an adapter

Core stays backend-agnostic. An adapter supplies `JobStreamOptions.frameMap`
and an `ApiErrorParser` (`parseError` on `createApi`). Optional hooks are
`shouldAccept`, `fetchState`, `prepareState`, `isTerminal`, and `requestInit`.
`ok`, `fail`, `isRecord`, and `decodeJson` are the decoder primitives. The
worked example that does not import Keel is
[docs/adapters.md](docs/adapters.md). `keelFrameMap` and `keelErrorParser` are
the same hooks aimed at Keel. `keelGate` in `src/lib/adapters/keel/gate.ts` is
the passcode shape. Copy that, do not import it, when the backend is not Keel.

## Docs

The routes under `/docs` show each export with a working example. Every page
is styled only by the reference stylesheet, so the behaviour shows without
suggesting a look.

- [scope](/docs/scope): what Chaaya covers (SSE over fetch, upload shapes) and what it does not.
- [tokens](/docs/tokens): the fixed role names and a checker that reports a
  role a theme block leaves out.
- [theme](/docs/theme): the three-state theme mechanism and the head script
  that paints the stored mode before first paint.
- [api](/docs/api): the fetch client. The example passes the Keel error parser.
- [auth](/docs/auth): a passcode on a caller-named header, and how `keelGate`
  is the adapter for one backend. The route matches the `@nrynss/chaaya/auth` export.
- [adapters](/docs/adapters): how to write `frameMap` and `parseError` without
  importing Keel. The copy-pasteable example is `docs/examples/plain-adapter.ts`.
- [form-actions](/docs/form-actions): map `ApiError` into SvelteKit `fail` /
  `error` data via the shared `readApiError` path.
- [job stream response](/docs/job-stream-response): `createJobStreamResponse` for a
  SvelteKit `+server.ts`.
- [upload](/docs/upload): one-shot `uploadBlob` beside the chunked `Uploader`.
- [job progress](/docs/job-progress): how any pipeline maps stages and counters
  onto `JobProgress`, and how `JobStream` applies a frame map. The follow
  loop stays in core.
- errors: `ChaayaError` from `@nrynss/chaaya/core` is the shape adapter authors
  can aim at. It has `code`, `message`, and optional `retryable` and `detail`.
  Core does not parse an envelope.
- [wire](/docs/wire): the Keel adapter's error envelope and job event parsers.
- [job](/docs/job): the Keel job stream.
- [recording session](/docs/recording-session): headless capture-to-upload session state.
- [audio capture](/docs/audio-capture): microphone capture in compressed and
  PCM modes, recorded from a generated signal.
- [audio upload](/docs/audio-upload): Keel's chunked upload, streamed to the
  route beside the page.
- [audio playback](/docs/audio-playback): playback through one element
  unlocked by the first gesture, with seeking.
- [video playback](/docs/video-playback): video through the same player,
  driven through an element the caller owns.
- [audio stream](/docs/audio-stream): the PcmStreamPlayer that schedules
  arriving blocks gaplessly on a supplied context, with a flush that cuts
  cleanly.
- [audio levels](/docs/audio-levels): live levels read from a generated tone.
- [audio peaks](/docs/audio-peaks): waveform peaks computed directly and in
  a worker, with agreement between the two.
- [session guard](/docs/session-guard): the guard that closes one live
  session exactly once when its page goes away.
- [transcript](/docs/transcript): timed words, the editor that cuts and
  reverts ranges, the regions drawn from the cuts, and the follower that
  binds the words to playback.
- [transcript stream](/docs/transcript-stream): fold timed-word SSE frames into the transcript editor list.
- [timeline](/docs/timeline): geometry under zoom and scroll, segment edits
  against snap targets, and handles that move by pointer and by keyboard.
- [testing](/docs/testing): the contrast gate and the accessibility gate run
  against the page itself, and the protocol asserts run against sample frames.

## Migration from 0.2.4 to 0.3.0

This split is breaking. The package version in this tree is `0.3.0`. Generic paths no longer speak Keel.

| 0.2.4 | 0.3.0 |
| --- | --- |
| `@nrynss/chaaya/wire` | `@nrynss/chaaya/keel` |
| `@nrynss/chaaya/job` | `@nrynss/chaaya/keel` |
| Chunked upload helpers on `@nrynss/chaaya/audio` | `@nrynss/chaaya/keel` |
| `api()` parses `{ error: { code, message, detail } }` | Import `api` from `@nrynss/chaaya/keel`, or pass `parseError: keelErrorParser` |

`timeout` and `network` are unchanged. A body the parser does not recognise
is still `http_error`.

Progress readings merge instead of replacing. On 0.2.4 a progress frame or a
snapshot that omitted `stage`, `current`, or `total` cleared that published
field. On 0.3.0 `mergeProgress` keeps the last value when the new reading
leaves the field out. A Keel stage-only progress frame is one case. A `done`
snapshot that omits the counter and the stage is another.

## Status

Published on [npm](https://www.npmjs.com/package/@nrynss/chaaya) as
`@nrynss/chaaya`. The current npm release is `0.3.0`, matching the frozen
`api/0.3.0/` record and tag `v0.3.0`.

```sh
npm install @nrynss/chaaya
```

## Releases

`api/<version>/` is the frozen public declarations for a version that has
been tagged. It is history, not a copy that every pull request refreshes.
`api/0.1.0` through `api/0.3.0` stay. Nothing in those directories is
rewritten.

`api/0.3.0/` is the freeze for this release. The gate diffs `dist` against
that record. It fails if a published record changes, and it fails if
`package.json` is not strictly newer than every frozen record. The packed
tarball is still typechecked. A record that exists must match the build,
and a non-breaking bump must keep the previous record's public files and
exports. Before `1.0.0` a minor bump may remove declarations (`0.2.4` to
`0.3.0`). A patch may not. From `1.0.0` only a major bump may remove them.

The next freeze needs a package bump first. `tools/freeze-api.sh` refuses
to overwrite `api/0.3.0/`.

Freeze at the tag, from a clean tree, after the gate has passed:

```sh
./tools/check.sh
./tools/freeze-api.sh
git add api/<version>
git commit -m "Freeze the <version> declarations"
git tag -a v<version> -m "<version>"
```

`tools/freeze-api.sh` copies the public `.d.ts` files out of `dist`. It
does not commit and it does not tag. Tagging before that commit would point
the tag at a tree with no snapshot.

## License

Apache-2.0. See [LICENSE](LICENSE).
