/**
 * Keel's wire shapes. One error envelope covers every failed request, and one
 * event frame covers every step of a job stream. A client branches on the
 * stable names here and never on message wording. These shapes belong to the
 * Keel adapter. They were checked against Keel v0.4.0. Generic modules do not
 * import this file.
 *
 * Every parser returns a typed value or a typed failure. A malformed frame
 * never throws, because one bad frame must cost a progress reading and never
 * the screen.
 */

import { decodeJson, fail, isRecord, ok, type ParseResult } from "../../../core/result.js"
import { parseNamedFrame, type NamedEvent } from "../../../core/sse/frame.js"

export type { ParseFailure, ParseResult } from "../../../core/result.js"

/** The body every non-2xx JSON response carries under its error member. */
export interface ErrorBody {
	/** The stable snake_case identifier a client branches on. */
	code: string
	/** A human sentence a client may show but never branch on. */
	message: string
	/** Optional detail the app alone reads. */
	detail?: unknown
}

/** The envelope every non-2xx JSON response carries. */
export interface ErrorEnvelope {
	error: ErrorBody
}

/** Validate an already decoded value against the error envelope shape. */
function decodeErrorEnvelope(value: unknown): ParseResult<ErrorEnvelope> {
	if (!isRecord(value) || !isRecord(value.error)) {
		return fail("the body carries no error object")
	}
	const { code, message, detail } = value.error
	if (typeof code !== "string") {
		return fail("the error code is absent or not a string")
	}
	if (typeof message !== "string") {
		return fail("the error message is absent or not a string")
	}
	return ok({ error: detail === undefined ? { code, message } : { code, message, detail } })
}

/** Parse the error envelope of a failed request. */
export function parseErrorEnvelope(text: string): ParseResult<ErrorEnvelope> {
	const decoded = decodeJson(text)
	if (!decoded.ok) return decoded
	return decodeErrorEnvelope(decoded.value)
}

/** The payload of a progress event. Progress reports work in flight and is
 * never terminal. */
export interface ProgressEvent {
	/** The frame id. Zero when the frame carries no id. */
	id: number
	/** The event name from the frame's event line. */
	name: "progress"
	/** The job the frame reports on. */
	jobId: string
	/** The step the job is running. */
	stage: string
	/** The work done so far. Absent when the producer omits it. */
	current?: number
	/** The work the job totals. Absent when the producer omits it. */
	total?: number
	/** Payload the app alone reads. Absent when the producer omits it. */
	detail?: unknown
}

/** The payload of a terminal status event. The payload status repeats the
 * event name, and the parser rejects a frame where the two disagree. */
export interface StatusEvent {
	/** The frame id. Zero when the frame carries no id. */
	id: number
	/** The event name from the frame's event line. */
	name: "done" | "cancelled" | "interrupted"
	/** The job the frame reports on. */
	jobId: string
	/** The terminal status, equal to the event name. */
	status: "done" | "cancelled" | "interrupted"
}

/** The payload of an error event. The error member is the same envelope a
 * failed request carries, so a reader feeds both to one parser. */
export interface ErrorEvent {
	/** The frame id. Zero when the frame carries no id. */
	id: number
	/** The event name from the frame's event line. */
	name: "error"
	/** The job the frame reports on. */
	jobId: string
	/** The terminal status, always error. */
	status: "error"
	/** The envelope body a failed request also carries. */
	error: ErrorEnvelope
}

/** The heartbeat a stream sends after a quiet period. A client ignores it. */
export interface HeartbeatEvent {
	/** The frame id. Zero when the frame carries no id. */
	id: number
	/** The event name, always heartbeat. */
	name: "heartbeat"
	/** The comment text the frame carried. */
	comment: string
}

/** Every frame a job stream can carry. */
export type JobEvent = ProgressEvent | StatusEvent | ErrorEvent | HeartbeatEvent

function parseProgress(id: number, jobId: string, data: Record<string, unknown>): ParseResult<ProgressEvent> {
	if (typeof data.stage !== "string") {
		return fail("the progress data has no stage string")
	}
	const event: ProgressEvent = { id, name: "progress", jobId, stage: data.stage }
	if (data.current !== undefined) {
		if (typeof data.current !== "number") return fail("the progress current is not a number")
		event.current = data.current
	}
	if (data.total !== undefined) {
		if (typeof data.total !== "number") return fail("the progress total is not a number")
		event.total = data.total
	}
	if (data.detail !== undefined) event.detail = data.detail
	return ok(event)
}

function parseStatus(
	id: number,
	name: StatusEvent["name"],
	jobId: string,
	data: Record<string, unknown>,
): ParseResult<StatusEvent> {
	if (data.status !== name) {
		return fail(`the ${name} data carries the status ${String(data.status)}`)
	}
	return ok({ id, name, jobId, status: name })
}

function parseErrorEvent(
	id: number,
	jobId: string,
	data: Record<string, unknown>,
): ParseResult<ErrorEvent> {
	if (data.status !== "error") {
		return fail(`the error data carries the status ${String(data.status)}`)
	}
	if (!isRecord(data.error)) {
		return fail("the error data carries no error object")
	}
	const envelope = decodeErrorEnvelope(data.error)
	if (!envelope.ok) return envelope
	return ok({ id, name: "error", jobId, status: "error", error: envelope.value })
}

/** A job event that is not a heartbeat. Comment frames never take this path. */
type JobDataEvent = ProgressEvent | StatusEvent | ErrorEvent

/** Read Keel's JSON payload off an event the frame reader already split.
 * Comment frames are not represented here. Heartbeats stay on `parseJobEvent`. */
function parseEventPayload(id: number, name: string, dataText: string): ParseResult<JobDataEvent> {
	if (dataText === "") return fail(`the ${name} frame carries no data`)
	const decoded = decodeJson(dataText)
	if (!decoded.ok) return decoded
	if (!isRecord(decoded.value)) return fail(`the ${name} data is not a JSON object`)
	const data = decoded.value
	if (typeof data.job_id !== "string") return fail(`the ${name} data has no job_id string`)
	switch (name) {
		case "progress":
			return parseProgress(id, data.job_id, data)
		case "done":
		case "cancelled":
		case "interrupted":
			return parseStatus(id, name, data.job_id, data)
		case "error":
			return parseErrorEvent(id, data.job_id, data)
		default:
			return fail(`the event name ${name} is not a job event`)
	}
}

/** Parse one named event the frame reader already split. This does not accept
 * comments. The JSON, `job_id`, and name rules match `parseJobEvent`. */
export function parseJobEventFromNamed(frame: NamedEvent): ParseResult<JobDataEvent> {
	return parseEventPayload(frame.id, frame.name, frame.data)
}

/** Parse one job event frame. It returns the typed event or a typed failure
 * and never throws, so a bad frame costs a progress reading and never the
 * screen. Field splitting is the shared frame reader. A comment frame is a
 * heartbeat. An event frame uses the same payload rules as
 * `parseJobEventFromNamed`. */
export function parseJobEvent(text: string): ParseResult<JobEvent> {
	const framed = parseNamedFrame(text)
	if (!framed.ok) return framed
	const frame = framed.value
	if (frame.kind === "comment") {
		return ok({ id: frame.id, name: "heartbeat", comment: frame.comment })
	}
	return parseEventPayload(frame.id, frame.name, frame.data)
}
