/** A request that reached an API but was refused, or never left the host.
 * The error carries a stable code, so a caller branches on code and never on
 * message. A timeout and a network failure carry status zero, because no
 * response arrived to name one. This client does not know any backend's error
 * body. A caller that has one passes parseError. */
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

/** The stable fields a product's error parser returns. */
export interface ApiFailureBody {
	/** The stable identifier a caller branches on. */
	code: string
	/** A sentence a caller may show and never branch on. */
	message: string
	/** Detail the app alone reads. */
	detail?: unknown
}

/** Read a failed body. Return undefined when the body is not that product's shape. */
export type ApiErrorParser = (text: string, response: Response) => ApiFailureBody | undefined

/** One request's options. It extends the fetch init, so a caller passes a
 * signal to cancel the request and timeoutMs to give it a deadline. */
export interface ApiRequestInit extends RequestInit {
	/** Abort the request after this many milliseconds. Omit for no deadline. */
	timeoutMs?: number
	/** Read this response's error body. It wins over the client default. */
	parseError?: ApiErrorParser
}

/** Defaults for every request a client makes. */
export interface ApiClientOptions {
	/** Read a failed body when the request does not pass its own parser. */
	parseError?: ApiErrorParser
}

/** Read the seconds a Retry-After header names. Whole seconds count, so an
 * HTTP date or a malformed value reads as absent. Upload shares this. */
export function readRetryAfter(response: Response): number | undefined {
	const header = response.headers.get("Retry-After")
	if (header === null) return undefined
	const trimmed = header.trim()
	return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined
}

/** Keep a detail object as the app's own record, and read anything else as empty. Upload shares this. */
export function detailObject(detail: unknown): Record<string, unknown> {
	if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return {}
	return detail as Record<string, unknown>
}

/** Decode a response body into a value. An empty or malformed body reads as
 * null, so a success with no body costs nothing and never throws. Upload shares this. */
export function decodeBody(text: string): unknown {
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

/** Turn a failed response into the one error a caller branches on. A parser
 * that recognises the body supplies the code. A throw or anything else keeps
 * http_error, so a bad body never becomes a network failure. */
function failure(response: Response, text: string, parseError: ApiErrorParser | undefined): ApiError {
	const retryAfterSeconds = readRetryAfter(response)
	let parsed: ApiFailureBody | undefined
	try {
		parsed = parseError?.(text, response)
	} catch {
		parsed = undefined
	}
	if (parsed !== undefined) {
		return new ApiError(
			parsed.message,
			parsed.code,
			response.status,
			detailObject(parsed.detail),
			retryAfterSeconds,
		)
	}
	return new ApiError(
		`${response.status} ${response.statusText}`,
		"http_error",
		response.status,
		{},
		retryAfterSeconds,
	)
}

/** Build a fetch wrapper. Every non-2xx response and every failed request
 * throws an ApiError. Pass parseError to read a backend body. The
 * default client reads none, so a body that is not parsed stays http_error. */
export function createApi(options: ApiClientOptions = {}): ApiClient {
	return async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
		const { timeoutMs, signal: caller, parseError, ...rest } = init
		const deadline = timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs)
		const parser = parseError ?? options.parseError

		try {
			const response = await fetch(path, { ...rest, signal: joinSignals(caller, deadline) })
			const text = await response.text()
			if (!response.ok) throw failure(response, text, parser)
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
}

/** A function a caller uses for every request. Adapters supply their own. */
export interface ApiClient {
	<T>(path: string, init?: ApiRequestInit): Promise<T>
}

/** The shared client. It does not read a backend error body. */
export const api: ApiClient = createApi()
