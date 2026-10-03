# Writing an adapter

Protocol limits (SSE over fetch, one-shot and chunked upload, no WebSocket) are [scope.md](scope.md).

Core follows a job and reads a failed response. It does not know a backend. An adapter is the code that supplies two functions: a `frameMap` for `JobStream`, and a `parseError` for the fetch client. Keel is one adapter, at `@nrynss/chaaya/keel`. It is not the definition of those functions. The file [docs/examples/plain-adapter.ts](examples/plain-adapter.ts) is a complete adapter you can copy. It is not published, and it does not import Keel. Copy that file. In an app, import from `@nrynss/chaaya/core` and `@nrynss/chaaya/auth`. The block below is that file with those specifiers. The repo copy uses `$lib` so the kit can typecheck it.

`JobProgress`, `ChaayaError`, and the follow loop stay in core. The guide for the reading itself is [job-progress.md](job-progress.md). The failure shape is [errors.md](errors.md). Passcode names are [auth.md](auth.md).

## The shapes

`JobStreamOptions.frameMap` is a plain object's own keys. Each key is an event name. Each value is a `JobFrameHandler`: `(frame: NamedEvent) => JobFrameAction`.

`NamedEvent` is the raw frame. `data` is the payload text. The handler parses it. Core does not.

A `JobFrameAction` is one of three kinds:

- `ignore` drops the frame. `Last-Event-ID` does not move.
- `progress` merges `reading` into the published `JobProgress`. A field that is present overwrites. A field that is absent stays.
- `terminal` ends the watch. It may also carry a `reading` and a `ChaayaError`.

A missing name is ignored. `Object.hasOwn` ignores inherited names such as `toString`. A result whose `kind` is not one of those three is ignored and does not end the watch. A handler that throws is also dropped. The throw does not fail the stream, and it does not move the cursor. Return `ignore` for a payload you cannot read, so the drop is a decision rather than an exception. The decoder helpers below do not throw.

`ApiErrorParser` is `(text, response) => ApiFailureBody | undefined`. Return `undefined` when the body is not your envelope. The client then uses `http_error`. A throw from the parser is the same as `undefined`. `createApi({ parseError })` sets it for every call. `ApiFailureBody` is `code`, `message`, and optional `detail`. It has no `retryable`. Put a retry flag in `detail`, or on a `ChaayaError` when the failure arrives as a terminal frame.

These options are optional. Omit any you do not need.

- `shouldAccept` runs before the map. Return false to drop the frame. That drop does not mean the frame was kept, and it does not move `Last-Event-ID`.
- `onAccept` runs only after a `progress` or `terminal` action. An ignore does not call it.
- `fetchState` runs once the event response is open. Resolve a `JobCatchUp`: `{ reading, error? }`. `reading` is a `JobProgress`. `error` is a `ChaayaError` beside it. Do not put the failure in `reading.detail`. A rejection leaves the stream alone.
- `prepareState` may rewrite that catch-up in the same turn, or return undefined to skip it.
- `isTerminal` says whether the catch-up reading ends the watch. Core has no terminal set. This sees the reading, not the error.
- `requestInit` is copied onto the event fetch. Use it for `headers` and `credentials`. `accept` is always `text/event-stream`. `signal` is ignored. The stream owns the abort.

A kept frame that carried an id line moves `Last-Event-ID`. A reconnect sends that header when the cursor is not 0. The first connect does not. A frame with no id line leaves the cursor. An empty `id:` line, or `id: 0`, on a kept frame resets it. A comment does not move it, including a comment that itself has an `id:` line. `JobStream` does not drop a repeated id. `createEventStream` does. A backend that reuses ids on a job stream will see those frames applied again.

## Decoder primitives

`ok`, `fail`, `isRecord`, and `decodeJson` are exported from `@nrynss/chaaya/core` for adapter authors. They return a `ParseResult`. They do not throw. App code that already holds a typed value does not need them.

Keel's parsers in `src/lib/adapters/keel/wire/index.ts` are the same primitives aimed at Keel's envelope and Keel's job payload. The example below aims them at a different document.

## A worked adapter

The event names are `progress`, `done`, and `error`. Those words are not reserved. The payload is not Keel's. Keel sends `jobId`, `stage`, `current`, and `total`, and its error frame nests `{ error: { code, message } }`. It also has `cancelled` and `interrupted`. This host sends `step`, `done`, and `of` on progress, a thin `done` frame, and `{ reason, again? }` on `error`. A failed catch-up document may carry `again` too; a finished or running one does not. A failed HTTP body is `{ failure: { kind, text, again? } }`, not Keel's `{ error: { code, message, detail? } }`.

Put the app result on the last `progress` frame, in `detail`. The `done` frame only sets `status`. Merge keeps the result. That is the rule in [job-progress.md](job-progress.md).

`watch`, when present, must match the id the page is following. `shouldAccept` drops a different one. A payload that is not an object is not dropped there. The progress handler ignores it. The error handler still ends the watch, with code `unreadable`, because the event name is already the terminal signal.

<!-- plain-adapter:start -->
```ts
import { createApi, createJobStream, decodeJson, fail, formatNamedFrame, isRecord, ok } from "@nrynss/chaaya/core"
import type { ApiClient, ApiErrorParser, ApiFailureBody, ChaayaError, JobCatchUp, JobFrameAction, JobFrameHandler, JobProgress, JobStream, JobStreamOptions, NamedEvent, ParseResult } from "@nrynss/chaaya/core"
import { apiWithGate, GatePasscode } from "@nrynss/chaaya/auth"
import type { GateOptions } from "@nrynss/chaaya/auth"

/**
 * Read `{ failure: { kind, text, again? } }`.
 * Any other body returns undefined, so the client keeps `http_error`.
 * `again` is copied onto `detail`. `ApiError` has no `retryable` field.
 * A terminal job frame uses `ChaayaError.retryable` instead.
 */
export const plainErrorParser: ApiErrorParser = (text) => {
	const decoded = decodeJson(text)
	if (!decoded.ok || !isRecord(decoded.value)) return undefined
	const failure = decoded.value.failure
	if (!isRecord(failure)) return undefined
	if (typeof failure.kind !== "string" || failure.kind === "") return undefined
	if (typeof failure.text !== "string") return undefined
	const body: ApiFailureBody = { code: failure.kind, message: failure.text }
	if (typeof failure.again === "boolean") body.detail = { again: failure.again }
	return body
}

/** The generic client with this parser. Pass a gate to send its header. */
export function plainApi(passcode?: GatePasscode): ApiClient {
	const call = createApi({ parseError: plainErrorParser })
	if (passcode === undefined) return call
	return apiWithGate(passcode, call)
}

/**
 * Header `X-App-Passcode`, cookie `app_gate`, code `passcode_required`.
 * An empty name is left empty, and `GatePasscode` throws.
 * This function does not replace an empty string with a default.
 */
export function plainGate(options: Partial<GateOptions> = {}): GatePasscode {
	return new GatePasscode({
		headerName: options.headerName ?? "X-App-Passcode",
		cookieName: options.cookieName ?? "app_gate",
		authCodes: options.authCodes ?? ["passcode_required"],
		jar: options.jar,
		initial: options.initial,
	})
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key]
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined
	return value
}

/**
 * Host `again` becomes `ChaayaError.retryable`.
 * The error frame and a failed catch-up share this mapping.
 */
function failedError(reason: unknown, again: unknown): ChaayaError {
	const error: ChaayaError = {
		code: "failed",
		message: typeof reason === "string" && reason !== "" ? reason : "the work stopped",
	}
	if (typeof again === "boolean") error.retryable = again
	return error
}

/** Map `{ step, done, of, result? }` onto a progress reading. Absent fields stay absent. */
function progressReading(value: Record<string, unknown>): JobProgress {
	const reading: JobProgress = { status: "running" }
	if (typeof value.step === "string") reading.stage = value.step
	const current = numberField(value, "done")
	const total = numberField(value, "of")
	if (current !== undefined) reading.current = current
	if (total !== undefined) reading.total = total
	if (typeof value.result === "string") reading.detail = { result: value.result }
	return reading
}

function payload(frame: NamedEvent): ParseResult<Record<string, unknown>> {
	const decoded = decodeJson(frame.data)
	if (!decoded.ok) return fail(decoded.failure.message)
	if (!isRecord(decoded.value)) return fail("the frame data is not an object")
	return ok(decoded.value)
}

function onProgress(frame: NamedEvent): JobFrameAction {
	const body = payload(frame)
	if (!body.ok) return { kind: "ignore" }
	return { kind: "progress", reading: progressReading(body.value) }
}

function onDone(frame: NamedEvent): JobFrameAction {
	if (frame.name !== "done") return { kind: "ignore" }
	return { kind: "terminal", reading: { status: "done" } }
}

function onError(frame: NamedEvent): JobFrameAction {
	const body = payload(frame)
	if (!body.ok) {
		return {
			kind: "terminal",
			reading: { status: "error" },
			error: { code: "unreadable", message: body.failure.message },
		}
	}
	return {
		kind: "terminal",
		reading: { status: "error" },
		error: failedError(body.value.reason, body.value.again),
	}
}

/** Handlers for the event names `progress`, `done`, and `error`. Any other name is absent, so the loop ignores it. */
export function plainFrameMap(): Record<string, JobFrameHandler> {
	return {
		progress: onProgress,
		done: onDone,
		error: onError,
	}
}

/**
 * Refuse a frame whose `watch` is present and not this id.
 * A payload that is not an object is left for the handler.
 * A progress handler ignores it. An error handler still ends the watch.
 */
export function plainShouldAccept(watchId: string): (frame: NamedEvent) => boolean {
	return (frame) => {
		const decoded = decodeJson(frame.data)
		if (!decoded.ok || !isRecord(decoded.value)) return true
		const watch = decoded.value.watch
		if (watch === undefined) return true
		return watch === watchId
	}
}

/** A catch-up ends the watch when the status is `done` or `error`. Core has no terminal enum. */
export function plainIsTerminal(reading: JobProgress): boolean {
	return reading.status === "done" || reading.status === "error"
}

/**
 * Read a state document.
 * `failed: true` wins over `finished: true`.
 * The error sits beside the reading. It is not stored in `detail`.
 * A failed document may carry `again`; it maps onto `retryable` the same way
 * an error frame does. A finished or running document has no `again`.
 */
export function plainCatchUp(body: unknown): ParseResult<JobCatchUp> {
	if (!isRecord(body)) return fail("the state is not an object")
	const reading = progressReading(body)
	if (body.failed === true) {
		reading.status = "error"
		const catchUp: JobCatchUp = { reading }
		const hasReason = typeof body.reason === "string" && body.reason !== ""
		const hasAgain = typeof body.again === "boolean"
		if (hasReason || hasAgain) {
			catchUp.error = failedError(hasReason ? body.reason : undefined, body.again)
		}
		return ok(catchUp)
	}
	if (body.finished === true) reading.status = "done"
	return ok({ reading })
}

/**
 * One stream. `fetchState` runs only after the event response is open.
 * A bad state document leaves the stream alone.
 * The state document is translated on its own promise, the same way Keel's
 * wrapper does. Pass a ready `JobCatchUp` into `createJobStream` when a
 * caller needs the reading in that same turn.
 */
export function plainJobStream(options: {
	url: string
	watchId: string
	fetchState?: () => Promise<unknown>
	requestInit?: RequestInit
	onReconnect?: (count: number) => void
}): JobStream {
	const streamOptions: JobStreamOptions = {
		url: options.url,
		frameMap: plainFrameMap(),
		shouldAccept: plainShouldAccept(options.watchId),
		isTerminal: plainIsTerminal,
		requestInit: options.requestInit,
		onReconnect: options.onReconnect,
	}
	const fetchState = options.fetchState
	if (fetchState !== undefined) {
		/** Translate on its own promise. Callers still pass `() => Promise<unknown>`. */
		streamOptions.fetchState = () =>
			fetchState().then((body) => {
				const parsed = plainCatchUp(body)
				if (!parsed.ok) throw new Error(parsed.failure.message)
				return parsed.value
			})
	}
	return createJobStream(streamOptions)
}

export interface PlainProgressFields {
	id: number
	step: string
	done: number
	of: number
	result?: string
	watch?: string
}

function dataRecord(fields: { watch?: string }, extra: Record<string, unknown>): string {
	const data: Record<string, unknown> = { ...extra }
	if (fields.watch !== undefined) data.watch = fields.watch
	return JSON.stringify(data)
}

/** One `progress` frame. The result belongs on the last progress frame. `done` stays thin. */
export function writeProgress(fields: PlainProgressFields): string {
	return formatNamedFrame({
		id: fields.id,
		event: "progress",
		data: dataRecord(fields, {
			step: fields.step,
			done: fields.done,
			of: fields.of,
			...(fields.result === undefined ? {} : { result: fields.result }),
		}),
	})
}

/** One `done` frame. Status only. A result written on the previous progress frame stays. */
export function writeDone(id: number, watch?: string): string {
	return formatNamedFrame({ id, event: "done", data: dataRecord({ watch }, {}) })
}

/** One `error` frame. `reason` is the message. `again` becomes `retryable`. */
export function writeError(id: number, reason: string, again?: boolean, watch?: string): string {
	return formatNamedFrame({
		id,
		event: "error",
		data: dataRecord({ watch }, again === undefined ? { reason } : { reason, again }),
	})
}

/** A comment heartbeat. It does not move `Last-Event-ID` and it does not enter `frameMap`. */
export function writeHeartbeat(): string {
	return formatNamedFrame({ comment: "ping" })
}
```
<!-- plain-adapter:end -->

The repo file imports `$lib/core/index.js` and `$lib/auth/index.js`. Replace those two specifiers as in the block above. Nothing else changes.

Wire a page like this. `attach` belongs in component setup, the same way `JobStream` documents it. `plainApi` is the fetch client for the state read and for every other call. `plainJobStream` translates the state document on its own promise. When a caller needs the reading in that same turn, pass a ready `JobCatchUp` into `createJobStream` instead.

```ts
import { plainApi, plainGate, plainJobStream } from "./plain-adapter"

const passcode = plainGate()
passcode.set("open-sesame")
const call = plainApi(passcode)

const stream = plainJobStream({
  url: "/jobs/1/events",
  watchId: "job-1",
  requestInit: passcode.apply({ credentials: "include" }),
  fetchState: () => call<unknown>("/jobs/1"),
})
stream.attach()
```

`apply` sets the header and does not set `credentials`. Pass `credentials: "include"` when the cookie must be sent. `Accept` on that init does not stick.

A catch-up document uses the same `step`, `done`, and `of` fields. `finished: true` sets `status` to `done` and `isTerminal` closes the watch. `failed: true` sets `status` to `error` and puts `reason` on the catch-up error. `failed` wins when both are set. A document that is not an object rejects, and the open stream stays up.

## The server writer

`formatNamedFrame` returns one frame, including the blank line that ends it. It does not build an HTTP response. Set `content-type: text/event-stream` on the response yourself. Join the strings. A line break inside `data` becomes another `data:` line. The reader joins those lines with `\n` before `decodeJson` runs, so keep each payload on one line, which `JSON.stringify` already does.

`writeHeartbeat` is a comment frame. `JobStream` records `lastComment` and does not call the map. An `id:` on that comment would not move the cursor. The writer above does not emit one.

A bad id, or a line break in the event name, throws from the writer. The reader never throws. One bad frame on the wire costs that frame, not the stream.

This is not a response helper. The host still owns the status line, the headers, and how the body is flushed.

## Auth

`GatePasscode` names no backend. An adapter is a function that fills the header, the cookie, and `authCodes`. `plainGate` above is that function for this host. `keelGate` in [src/lib/adapters/keel/gate.ts](../src/lib/adapters/keel/gate.ts) is the same function for Keel: header `X-Passcode`, cookie `passcode`, code `passcode_required`. Copy that file's shape when the only difference is the names.

`keelGate` treats an empty `headerName` or `cookieName` as "use Keel's default". `GatePasscode` throws on an empty name. `plainGate` does not copy the empty-string substitution. Pass a real name, or omit the option.

`requestInit` on the job stream is how the event fetch gets the header. `apiWithGate`, which `plainApi` uses when you pass a gate, does the same for ordinary calls. `authCodes` is checked with `includes`. A code named `constructor` is not an auth code unless it is in the list. `instanceof GateError` is the auth refusal. The details are in [auth.md](auth.md).

## What Keel adds, and what it does not change

`keelFrameMap` in `src/lib/adapters/keel/job/map.ts` returns the `frameMap` core already expects. `keelErrorParser` in `src/lib/adapters/keel/api.ts` is the `ApiErrorParser` for Keel's envelope. `keelShouldAccept` is the optional refusal hook, used so a frame for another job is dropped before the map. The Keel `JobStream` is a thin wrapper that passes those into core. The read loop is not in that file.

Use the Keel export when the server is Keel. Use the example on this page when it is not. Do not import `@nrynss/chaaya/keel` from an adapter that is not Keel.

Chunked upload is a different contract, `Uploader` on `@nrynss/chaaya/core`. Keel's chunked protocol implements it. One-shot upload lives on `@nrynss/chaaya/upload` and is not an adapter. Neither is required to follow a job.

## Where to import

- Stream, actions, progress, errors, decoders, and `formatNamedFrame`: `@nrynss/chaaya/core`.
- `GatePasscode` and `apiWithGate`: `@nrynss/chaaya/auth`.
- Keel's worked adapter, only for a Keel server: `@nrynss/chaaya/keel`.
