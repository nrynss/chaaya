import { ApiError, api, type ApiErrorParser, type ApiFailureBody } from "./api.js"

/** A file refused before it is sent, because it is past the caller's limit. */
export class UploadTooLarge extends Error {
	readonly code = "too_large"
	readonly size: number
	readonly limit: number

	constructor(size: number, limit: number) {
		super(`the file is ${size} bytes, past the ${limit} byte limit`)
		this.name = "UploadTooLarge"
		this.size = size
		this.limit = limit
	}
}

/** `maxBytes` was set on a FormData body, which has no size until the browser encodes it. */
export class UploadSizeUnknown extends Error {
	readonly code = "size_unknown"

	constructor() {
		super("maxBytes cannot measure a FormData body")
		this.name = "UploadSizeUnknown"
	}
}

/** Options for one short upload. This is not the chunked `Uploader`. */
export interface BlobUploadOptions {
	/** Headers such as a bearer token. A multipart body drops Content-Type so the boundary stays intact.
	 * A signed URL often sends no Authorization header. Set Content-Type here when the store requires one. */
	headers?: HeadersInit
	/** `include` sends cookies (`withCredentials` on the browser path). `omit` sends none, which is what a presigned URL wants. Default matches fetch: cookies stay on the same origin. */
	credentials?: RequestCredentials
	/** Extra text fields when the body is a blob posted as multipart. Ignored when body is already FormData. */
	fields?: Readonly<Record<string, string>>
	/** False posts a blob as the raw body. Use that for a presigned PUT. Default true. Ignored when body is FormData. */
	formData?: boolean
	/** Form field name for a blob. Default file. */
	field?: string
	/** File name the multipart part carries. */
	filename?: string
	/** HTTP method. Default POST. A presigned store URL is usually PUT. */
	method?: string
	/** Abort the request. */
	signal?: AbortSignal
	/** Give up after this many milliseconds. */
	timeoutMs?: number
	/** Refuse a larger blob before any request is sent. A FormData body throws UploadSizeUnknown instead of skipping the check. */
	maxBytes?: number
	/** Bytes the browser has handed to the socket, then the total when it knows one.
	 * On a browser this is XMLHttpRequest upload progress, including values before the response.
	 * A host with no XMLHttpRequest uses fetch, which cannot see the socket, and calls this once after settle with the blob size (or 0, 0 for FormData). */
	onProgress?: (loaded: number, total: number) => void
	/** Read a refused body. Omit and a non-2xx stays http_error. */
	parseError?: ApiErrorParser
}

function fileName(body: Blob, explicit: string | undefined): string {
	if (explicit !== undefined && explicit !== "") return explicit
	if (typeof File !== "undefined" && body instanceof File && body.name !== "") return body.name
	return "upload"
}

function sizeOf(body: Blob | FormData): number {
	return body instanceof Blob ? body.size : 0
}

function detailObject(detail: unknown): Record<string, unknown> {
	if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return {}
	return detail as Record<string, unknown>
}

function decodeBody(text: string): unknown {
	if (text.length === 0) return null
	try {
		return JSON.parse(text)
	} catch {
		return null
	}
}

function readRetryAfter(header: string | null): number | undefined {
	if (header === null) return undefined
	const trimmed = header.trim()
	return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined
}

/** The same refusal `api()` builds. A parser throw stays http_error. */
function failure(status: number, statusText: string, text: string, retryAfter: string | null, parseError: ApiErrorParser | undefined): ApiError {
	const retryAfterSeconds = readRetryAfter(retryAfter)
	let parsed: ApiFailureBody | undefined
	try {
		if (parseError !== undefined) {
			const response = new Response(text, { status, statusText })
			parsed = parseError(text, response)
		}
	} catch {
		parsed = undefined
	}
	if (parsed !== undefined) {
		return new ApiError(parsed.message, parsed.code, status, detailObject(parsed.detail), retryAfterSeconds)
	}
	return new ApiError(`${status} ${statusText}`, "http_error", status, {}, retryAfterSeconds)
}

interface Prepared {
	method: string
	headers: Headers
	payload: BodyInit
	size: number
}

function prepare(body: Blob | FormData, options: BlobUploadOptions): Prepared {
	const limit = options.maxBytes
	const size = sizeOf(body)
	if (body instanceof FormData && limit !== undefined) {
		throw new UploadSizeUnknown()
	}
	if (limit !== undefined && body instanceof Blob && size > limit) {
		throw new UploadTooLarge(size, limit)
	}
	const headers = new Headers(options.headers)
	let payload: BodyInit
	if (body instanceof FormData) {
		headers.delete("content-type")
		payload = body
	} else if (options.formData === false) {
		if (!headers.has("content-type") && body.type !== "") headers.set("content-type", body.type)
		payload = body
	} else {
		const form = new FormData()
		if (options.fields !== undefined) {
			for (const [name, value] of Object.entries(options.fields)) form.append(name, value)
		}
		form.append(options.field ?? "file", body, fileName(body, options.filename))
		headers.delete("content-type")
		payload = form
	}
	return { method: options.method ?? "POST", headers, payload, size }
}

function settle<T>(status: number, statusText: string, text: string, retryAfter: string | null, parseError: ApiErrorParser | undefined): T {
	if (status < 200 || status >= 300) throw failure(status, statusText, text, retryAfter, parseError)
	return decodeBody(text) as T
}

function sendWithXhr<T>(url: string, prepared: Prepared, options: BlobUploadOptions): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const xhr = new XMLHttpRequest()
		xhr.open(prepared.method, url)
		prepared.headers.forEach((value, key) => {
			xhr.setRequestHeader(key, value)
		})
		xhr.responseType = "text"
		xhr.withCredentials = options.credentials === "include"
		if (options.timeoutMs !== undefined) xhr.timeout = options.timeoutMs
		const progress = options.onProgress
		if (progress !== undefined) {
			xhr.upload.onprogress = (event) => {
				const total = event.lengthComputable ? event.total : prepared.size
				progress(event.loaded, total)
			}
		}
		const signal = options.signal
		const onAbort = () => {
			xhr.abort()
		}
		if (signal !== undefined) {
			if (signal.aborted) {
				reject(signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted.", "AbortError"))
				return
			}
			signal.addEventListener("abort", onAbort, { once: true })
		}
		const finish = () => {
			signal?.removeEventListener("abort", onAbort)
		}
		xhr.onload = () => {
			finish()
			try {
				resolve(settle(xhr.status, xhr.statusText, xhr.responseText, xhr.getResponseHeader("Retry-After"), options.parseError))
			} catch (cause) {
				reject(cause)
			}
		}
		xhr.onerror = () => {
			finish()
			reject(new ApiError("The request could not reach the server.", "network", 0))
		}
		xhr.ontimeout = () => {
			finish()
			reject(new ApiError("The request gave up before the server answered.", "timeout", 0))
		}
		xhr.onabort = () => {
			finish()
			const reason = signal?.reason
			reject(reason instanceof Error ? reason : new DOMException("The operation was aborted.", "AbortError"))
		}
		xhr.send(prepared.payload)
	})
}

/**
 * Send one short blob or form. The caller supplies the route and the fields.
 *
 * This is the one-shot sibling of `Uploader`. `Uploader` is chunked (`start`,
 * `append`, `finish`) and can resume. This helper sends the whole body in one
 * request and cannot resume. A large file belongs on `Uploader`.
 *
 * A presigned store URL is `method: "PUT"`, `formData: false`, and
 * `credentials: "omit"`. Pass no Authorization header unless the signer asked
 * for one. The raw blob is the body.
 *
 * A browser sends through XMLHttpRequest so `onProgress` sees socket progress.
 * A host with no XMLHttpRequest falls back to fetch and reports progress once,
 * after the response, because fetch does not expose upload progress.
 *
 * A refusal matches `api()`: `parseError` may name the code, otherwise it is
 * `http_error`. A blob past `maxBytes` throws `UploadTooLarge` and never leaves
 * the caller. `maxBytes` on FormData throws `UploadSizeUnknown` instead of
 * pretending the form is empty.
 */
export function uploadBlob<T>(url: string, body: Blob | FormData, options: BlobUploadOptions = {}): Promise<T> {
	let prepared: Prepared
	try {
		prepared = prepare(body, options)
	} catch (cause) {
		return Promise.reject(cause)
	}
	if (typeof XMLHttpRequest !== "undefined") return sendWithXhr(url, prepared, options)
	return api<T>(url, {
		method: prepared.method,
		headers: prepared.headers,
		body: prepared.payload,
		credentials: options.credentials,
		signal: options.signal,
		timeoutMs: options.timeoutMs,
		parseError: options.parseError,
	}).then((value) => {
		options.onProgress?.(prepared.size, prepared.size)
		return value
	})
}
