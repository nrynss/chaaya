/**
 * The wire shapes a Keel client reads. One error envelope covers every failed
 * request, and one event frame covers every step of a job stream. A client
 * branches on the stable names here and never on message wording.
 *
 * Every parser returns a typed value or a typed failure. A malformed frame
 * never throws, because one bad frame must cost a progress reading and never
 * the screen.
 */

/** The reason a parser rejected its input. */
export interface ParseFailure {
	/** A short sentence naming what the input lacked. */
	message: string
}

/** A parsed value, or the failure that replaced it. */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; failure: ParseFailure }

function ok<T>(value: T): ParseResult<T> {
	return { ok: true, value }
}

function fail<T>(message: string): ParseResult<T> {
	return { ok: false, failure: { message } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Decode a JSON text into a value, or fail without throwing. */
function decodeJson(text: string): ParseResult<unknown> {
	try {
		return ok(JSON.parse(text))
	} catch {
		return fail("the text does not hold valid JSON")
	}
}

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

/** One server-sent event frame read from a stream. A comment frame, such as a
 * heartbeat, carries a comment and leaves event, id and data empty. */
interface EventFrame {
	comment: string
	event: string
	id: number
	data: string
}

/** Read one frame from its text. A blank line ends the frame and its data
 * lines join with a newline, so a payload split over several lines reads back
 * whole. The reader never throws, so a malformed id comes back as a failure. */
function parseFrame(text: string): ParseResult<EventFrame> {
	const frame: EventFrame = { comment: "", event: "", id: 0, data: "" }
	const data: string[] = []
	let sawField = false
	for (const raw of text.split("\n")) {
		const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw
		if (line === "") {
			if (!sawField) continue
			break
		}
		sawField = true
		const at = line.indexOf(":")
		const name = at === -1 ? line : line.slice(0, at)
		let value = at === -1 ? "" : line.slice(at + 1)
		if (value.startsWith(" ")) value = value.slice(1)
		switch (name) {
			case "":
				frame.comment = value
				break
			case "event":
				frame.event = value
				break
			case "id": {
				const id = Number(value)
				if (!Number.isInteger(id) || id < 0) {
					return fail(`the frame id ${value} is not a whole number`)
				}
				frame.id = id
				break
			}
			case "data":
				data.push(value)
				break
		}
	}
	if (data.length > 0) frame.data = data.join("\n")
	return ok(frame)
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

/** Parse one job event frame. It returns the typed event or a typed failure
 * and never throws, so a bad frame costs a progress reading and never the
 * screen. */
export function parseJobEvent(text: string): ParseResult<JobEvent> {
	const framed = parseFrame(text)
	if (!framed.ok) return framed
	const frame = framed.value
	if (frame.event === "") {
		if (frame.comment === "") return fail("the frame carries neither an event nor a comment")
		return ok({ id: frame.id, name: "heartbeat", comment: frame.comment })
	}
	if (frame.data === "") return fail(`the ${frame.event} frame carries no data`)
	const decoded = decodeJson(frame.data)
	if (!decoded.ok) return decoded
	if (!isRecord(decoded.value)) return fail(`the ${frame.event} data is not a JSON object`)
	const data = decoded.value
	if (typeof data.job_id !== "string") return fail(`the ${frame.event} data has no job_id string`)
	switch (frame.event) {
		case "progress":
			return parseProgress(frame.id, data.job_id, data)
		case "done":
		case "cancelled":
		case "interrupted":
			return parseStatus(frame.id, frame.event, data.job_id, data)
		case "error":
			return parseErrorEvent(frame.id, data.job_id, data)
		default:
			return fail(`the event name ${frame.event} is not a job event`)
	}
}
