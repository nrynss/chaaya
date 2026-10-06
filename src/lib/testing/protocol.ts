/**
 * Protocol asserts for adapter authors. An adapter maps its backend onto the
 * generic contracts, and these helpers check that mapping without running a
 * stream or touching the network.
 *
 * Each helper throws one error that names the first drift it meets, so a
 * failure points at the field to fix. Each helper is pure. Importing this
 * module does no DOM work and starts no stream, so a server render stays
 * safe.
 *
 * `assertSseFrame` checks the generic frame format, including the id flags a
 * reconnect reads. A kept event frame that carried an id line moves
 * `Last-Event-ID`. An empty `id:` line, or `id: 0`, on a kept event resets
 * it. A frame with no id line leaves it. A comment never moves it, even when
 * the comment carries an id line. A refused frame never moves it either,
 * because the loop applies a frame only after `shouldAccept` keeps it and the
 * map returns progress or terminal. The assert covers the flags. The loop
 * owns the cursor.
 *
 * `assertErrorEnvelope` checks the error target shape. Both failures and
 * refusals aim at it. A refusal that carries a new quote keeps that quote in
 * `detail`, so the caller still reads one shape. A parser that does not
 * recognise a body returns undefined, and the client keeps `http_error`.
 * That fallback is the refusal contract beside this shape.
 *
 * `assertJobProgress` checks the reading shape, and it optionally checks the
 * `frameMap` that produced it. Core reads that map with `Object.hasOwn`, so
 * inherited names such as `toString` never run as handlers. A map entry that
 * is not a function is ignored the same way, so the assert rejects it as
 * drift rather than letting it read as a silent drop.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function wholeId(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function nonEmpty(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== ""
}

/**
 * Check one parsed frame against the generic format. An event frame carries a
 * name and a data string. A comment frame carries comment text and neither a
 * name nor data. Both carry a whole-number id. An id line is reported with
 * `idSet`, and an empty one adds `resetId` on id 0. Either flag, when
 * present, is true. Anything else is drift.
 */
export function assertSseFrame(value: unknown): void {
	const label = "assertSseFrame"
	if (!isRecord(value)) throw new Error(`${label} needs an object frame`)
	const kind = value.kind
	if (kind !== "event" && kind !== "comment") {
		throw new Error(`${label} needs kind event or comment`)
	}
	if (!wholeId(value.id)) throw new Error(`${label} needs a whole-number id of 0 or more`)
	for (const flag of ["idSet", "resetId"] as const) {
		if (value[flag] !== undefined && value[flag] !== true) {
			throw new Error(`${label} needs ${flag} true or absent`)
		}
	}
	if (value.resetId === true && (value.idSet !== true || value.id !== 0)) {
		throw new Error(`${label} needs resetId on id 0 with idSet`)
	}
	if (kind === "event") {
		if (!nonEmpty(value.name)) throw new Error(`${label} needs a non-empty event name`)
		if (typeof value.data !== "string") throw new Error(`${label} needs a data string`)
		if (value.comment !== undefined) throw new Error(`${label} forbids comment text on an event`)
		return
	}
	if (!nonEmpty(value.comment)) throw new Error(`${label} needs non-empty comment text`)
	if (value.name !== undefined) throw new Error(`${label} forbids a name on a comment`)
	if (value.data !== undefined) throw new Error(`${label} forbids data on a comment`)
}

/** The body an envelope or a bare error carries. */
function assertErrorBody(label: string, value: unknown): void {
	if (!isRecord(value)) throw new Error(`${label} needs an error object`)
	if (!nonEmpty(value.code)) throw new Error(`${label} needs a non-empty code`)
	if (!nonEmpty(value.message)) throw new Error(`${label} needs a non-empty message`)
	if (value.retryable !== undefined && typeof value.retryable !== "boolean") {
		throw new Error(`${label} needs retryable true or false when present`)
	}
}

/**
 * Check one failure against the error target shape. A bare body carries
 * `code` and `message` with optional `retryable` and `detail`. An envelope
 * wraps that body under `error`. Either form passes. The code is what a
 * caller branches on. The message is what a caller may show. `retryable`
 * says whether the same call is worth repeating. `detail` stays opaque.
 */
export function assertErrorEnvelope(value: unknown): void {
	const label = "assertErrorEnvelope"
	if (!isRecord(value)) throw new Error(`${label} needs an object`)
	const body = isRecord(value.error) ? value.error : value
	assertErrorBody(label, body)
}

function assertCounter(label: string, value: unknown, field: string): void {
	if (value === undefined) return
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(`${label} needs ${field} finite and 0 or more when present`)
	}
}

/**
 * Check one reading against the `JobProgress` shape, and optionally check
 * the `frameMap` that produced it. Every reading field is optional. An id, a
 * stage, and a status name the work, so each one is a non-empty string when
 * present. The counters share one unit, so each one is finite and 0 or more
 * when present. `detail` stays opaque, and the app alone reads it. A
 * supplied map must be a plain record of handler functions, because the loop
 * ignores any other entry.
 */
export function assertJobProgress(value: unknown, frameMap?: unknown): void {
	const label = "assertJobProgress"
	if (!isRecord(value)) throw new Error(`${label} needs a progress object`)
	for (const field of ["id", "stage", "status"] as const) {
		if (value[field] !== undefined && !nonEmpty(value[field])) {
			throw new Error(`${label} needs ${field} non-empty when present`)
		}
	}
	assertCounter(label, value.current, "current")
	assertCounter(label, value.total, "total")
	if (frameMap === undefined) return
	if (!isRecord(frameMap)) throw new Error(`${label} needs a frame map object`)
	const shape = Object.getPrototypeOf(frameMap)
	if (shape !== Object.prototype && shape !== null) {
		throw new Error(`${label} needs a plain frame map object`)
	}
	for (const name of Object.keys(frameMap)) {
		if (typeof frameMap[name] !== "function") {
			throw new Error(`${label} needs a handler function at ${name}`)
		}
	}
}
