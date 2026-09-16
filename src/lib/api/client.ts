import { parseErrorEnvelope } from "../wire"

/** A request that reached the API but was refused, or never left the host.
 * The error carries the contract's stable code, so a caller branches on code
 * and never on message. A timeout and a network failure carry status zero,
 * because no response arrived to name one. */
export class ApiError extends Error {
	/** The stable identifier a caller branches on. */
	readonly code: string
	/** The HTTP status, or zero when no response arrived. */
	readonly status: number
	/** The detail object the app alone reads, empty when the body carried none. */
	readonly detail: Record<string, unknown>
	/** The seconds a 429 tells the caller to wait, when the header names one. */
	readonly retryAfterSeconds?: number

	constructor(
		message: string,
		code: string,
		status: number,
		detail: Record<string, unknown> = {},
		retryAfterSeconds?: number,
	) {
		super(message)
		this.name = "ApiError"
		this.code = code
		this.status = status
		this.detail = detail
		this.retryAfterSeconds = retryAfterSeconds
	}
}

/** One request's options. It extends the fetch init, so a caller passes a
 * signal to cancel the request and timeoutMs to give it a deadline. */
export interface ApiRequestInit extends RequestInit {
	/** Abort the request after this many milliseconds. Omit for no deadline. */
	timeoutMs?: number
}

/** Read the seconds a Retry-After header names. The contract sends whole
 * seconds, so an HTTP date or a malformed value reads as absent. */
function readRetryAfter(response: Response): number | undefined {
	const header = response.headers.get("Retry-After")
	if (header === null) return undefined
	const trimmed = header.trim()
	return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined
}

/** Keep a detail object as the app's own record, and read anything else as
 * empty. */
function detailObject(detail: unknown): Record<string, unknown> {
	if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return {}
	return detail as Record<string, unknown>
}

/** Decode a response body into a value. An empty or malformed body reads as
 * null, so a success with no body costs nothing and never throws. */
function decodeBody(text: string): unknown {
	if (text.length === 0) return null
	try {
		return JSON.parse(text)
	} catch {
		return null
	}
}

/** Join the caller's signal with the deadline. Either one aborts the request,
 * and a lone signal passes straight through. */
function joinSignals(
	caller: AbortSignal | null | undefined,
	deadline: AbortSignal | undefined,
): AbortSignal | undefined {
	if (!caller) return deadline
	if (deadline === undefined) return caller
	return AbortSignal.any([caller, deadline])
}

/** Turn a failed response into the one error a caller branches on. The wire
 * parser owns the envelope shape, so the client never invents its own. A body
 * that carries no envelope keeps the code http_error. */
function failure(response: Response, text: string): ApiError {
	const retryAfterSeconds = readRetryAfter(response)
	const parsed = parseErrorEnvelope(text)
	if (parsed.ok) {
		const { code, message, detail } = parsed.value.error
		return new ApiError(message, code, response.status, detailObject(detail), retryAfterSeconds)
	}
	return new ApiError(
		`${response.status} ${response.statusText}`,
		"http_error",
		response.status,
		{},
		retryAfterSeconds,
	)
}

/** Fetch wrapper against the one error shape the API guarantees. Every
 * non-2xx response and every failed request throws an ApiError. A caller
 * stops the request with a signal, gives it a deadline with timeoutMs, and
 * reads the retry hint a 429 sends. */
export async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
	const { timeoutMs, signal: caller, ...rest } = init
	const deadline = timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs)

	try {
		const response = await fetch(path, { ...rest, signal: joinSignals(caller, deadline) })
		const text = await response.text()
		if (!response.ok) throw failure(response, text)
		return decodeBody(text) as T
	} catch (cause) {
		if (cause instanceof ApiError) throw cause
		if (deadline?.aborted) {
			throw new ApiError("The request gave up before the server answered.", "timeout", 0)
		}
		if (caller?.aborted) throw cause
		throw new ApiError("The request could not reach the server.", "network", 0)
	}
}
