import { createApi, createJobStream, decodeJson, fail, formatNamedFrame, isRecord, ok } from "$lib/core/index.js"
import type { ApiClient, ApiErrorParser, ApiFailureBody, ChaayaError, JobCatchUp, JobFrameAction, JobFrameHandler, JobProgress, JobStream, JobStreamOptions, NamedEvent, ParseResult } from "$lib/core/index.js"
import { apiWithGate, GatePasscode } from "$lib/auth/index.js"
import type { GateOptions } from "$lib/auth/index.js"

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
	const reason = body.value.reason
	const error: ChaayaError = {
		code: "failed",
		message: typeof reason === "string" && reason !== "" ? reason : "the work stopped",
	}
	if (typeof body.value.again === "boolean") error.retryable = body.value.again
	return { kind: "terminal", reading: { status: "error" }, error }
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
 */
export function plainCatchUp(body: unknown): ParseResult<JobCatchUp> {
	if (!isRecord(body)) return fail("the state is not an object")
	const reading = progressReading(body)
	if (body.failed === true) {
		reading.status = "error"
		const catchUp: JobCatchUp = { reading }
		if (typeof body.reason === "string" && body.reason !== "") {
			catchUp.error = { code: "failed", message: body.reason }
		}
		return ok(catchUp)
	}
	if (body.finished === true) reading.status = "done"
	return ok({ reading })
}

/** One stream. `fetchState` runs only after the event response is open. A bad state document leaves the stream alone. */
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
		streamOptions.fetchState = async () => {
			const parsed = plainCatchUp(await fetchState())
			if (!parsed.ok) throw new Error(parsed.failure.message)
			return parsed.value
		}
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
