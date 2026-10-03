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

/** `maxBytes` was set, and this body has no size the caller named. */
export class UploadSizeUnknown extends Error {
	readonly code = "size_unknown"

	constructor() {
		super("set maxBytes only for Blob bodies, or pass an explicit size.")
		this.name = "UploadSizeUnknown"
	}
}

/** Options for one short upload. This is not the chunked `Uploader`. */
export interface BlobUploadOptions {
	/** Headers such as a bearer token. A multipart body drops Content-Type so the boundary stays intact.
	 * A signed URL often sends no Authorization header. Set Content-Type here when the store requires one. */
	headers?: HeadersInit
	/** Cookie policy, read by both transports.
	 * Fetch receives this value as-is. Omit it and fetch keeps its default, which sends cookies on the same origin.
	 * XMLHttpRequest sets `withCredentials` only when this is `"include"`. That flag affects cross-origin requests.
	 * Same-origin XHR always sends cookies, so `"omit"` does not strip them there. */
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
	/** Refuse a larger body before any request is sent.
	 * A Blob is measured by `size`. FormData has no size until the browser encodes it, so pass `size` or omit `maxBytes`.
	 * Otherwise this throws `UploadSizeUnknown` instead of skipping the check. */
	maxBytes?: number
	/** Byte length the caller already knows. Required when `maxBytes` is set on FormData.
	 * A Blob uses its own `size` and ignores this. */
	size?: number
	/** Bytes handed to the socket, and the total when one is known.
	 * `uploadBlob` calls this once, after the response, with the known size (0 when FormData has no `size`).
	 * `uploadBlobWithProgress` calls this from `xhr.upload.onprogress`, including samples before the response. */
	onProgress?: (loaded: number, total: number) => void
	/** Read a refused body. Omit and a non-2xx stays http_error. */
	parseError?: ApiErrorParser
}

/** A body ready to send. A later multipart helper should reuse this instead of rebuilding the request. */
export interface UploadPrepared {
	method: string
	headers: Headers
	payload: BodyInit
	/** Known byte length, or 0 when the body is FormData and the caller passed no size. */
	size: number
}

function fileName(body: Blob, explicit: string | undefined): string {
	if (explicit !== undefined && explicit !== "") return explicit
	if (typeof File !== "undefined" && body instanceof File && body.name !== "") return body.name
	return "upload"
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

/** The same refusal `api()` builds. A parser throw stays http_error.
 * The XHR path uses this. The fetch path uses `api()`, which applies the same rule. */
export function uploadFailure(
	status: number,
	statusText: string,
	text: string,
	retryAfter: string | null,
	parseError: ApiErrorParser | undefined,
): ApiError {
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

/** The one progress callback both transports call. A multipart helper should call this too, not a second shape. */
export function reportUploadProgress(
	onProgress: BlobUploadOptions["onProgress"],
	loaded: number,
	total: number,
): void {
	onProgress?.(loaded, total)
}

/** Measure, limit, and shape one body. Blob and FormData share this, and a later part upload should too. */
export function prepareUpload(body: Blob | FormData, options: BlobUploadOptions): UploadPrepared {
	const limit = options.maxBytes
	const known = body instanceof Blob ? body.size : options.size
	if (limit !== undefined && known === undefined) throw new UploadSizeUnknown()
	if (limit !== undefined && known !== undefined && known > limit) throw new UploadTooLarge(known, limit)
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
	return { method: options.method ?? "POST", headers, payload, size: known ?? 0 }
}

function settle<T>(
	status: number,
	statusText: string,
	text: string,
	retryAfter: string | null,
	parseError: ApiErrorParser | undefined,
): T {
	if (status < 200 || status >= 300) throw uploadFailure(status, statusText, text, retryAfter, parseError)
	return decodeBody(text) as T
}

/** Fetch transport. Progress is one call after settle. `#31` should not copy this request. */
export function sendUpload<T>(url: string, prepared: UploadPrepared, options: BlobUploadOptions): Promise<T> {
	return api<T>(url, {
		method: prepared.method,
		headers: prepared.headers,
		body: prepared.payload,
		credentials: options.credentials,
		signal: options.signal,
		timeoutMs: options.timeoutMs,
		parseError: options.parseError,
	}).then((value) => {
		reportUploadProgress(options.onProgress, prepared.size, prepared.size)
		return value
	})
}

/** XMLHttpRequest transport. Progress is `xhr.upload.onprogress`. `#31` should send parts through this. */
export function sendUploadWithProgress<T>(url: string, prepared: UploadPrepared, options: BlobUploadOptions): Promise<T> {
	if (typeof XMLHttpRequest === "undefined") {
		return Promise.reject(new Error("uploadBlobWithProgress needs XMLHttpRequest"))
	}
	return new Promise<T>((resolve, reject) => {
		const xhr = new XMLHttpRequest()
		xhr.open(prepared.method, url)
		prepared.headers.forEach((value, key) => {
			xhr.setRequestHeader(key, value)
		})
		xhr.responseType = "text"
		xhr.withCredentials = options.credentials === "include"
		if (options.timeoutMs !== undefined) xhr.timeout = options.timeoutMs
		xhr.upload.onprogress = (event) => {
			const total = event.lengthComputable ? event.total : prepared.size
			reportUploadProgress(options.onProgress, event.loaded, total)
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

function begin(body: Blob | FormData, options: BlobUploadOptions): Promise<UploadPrepared> {
	try {
		return Promise.resolve(prepareUpload(body, options))
	} catch (cause) {
		return Promise.reject(cause)
	}
}

/**
 * Send one short blob or form with fetch.
 *
 * This is the one-shot sibling of `Uploader`. `Uploader` is chunked (`start`,
 * `append`, `finish`) and can resume. This helper sends the whole body in one
 * request and cannot resume. A large file belongs on `Uploader`.
 *
 * `onProgress` fires once, after the response settles, with the known size.
 * Fetch cannot see the socket. Use `uploadBlobWithProgress` when the bar must
 * move while the bytes are leaving.
 *
 * A presigned store URL is `method: "PUT"`, `formData: false`, and
 * `credentials: "omit"`. Pass no Authorization header unless the signer asked
 * for one. The raw blob is the body.
 *
 * A refusal matches `api()`: `parseError` may name the code, otherwise it is
 * `http_error`. A blob past `maxBytes` throws `UploadTooLarge` and never leaves
 * the caller. `maxBytes` on FormData without `size` throws `UploadSizeUnknown`.
 */
export function uploadBlob<T>(url: string, body: Blob | FormData, options: BlobUploadOptions = {}): Promise<T> {
	return begin(body, options).then((prepared) => sendUpload<T>(url, prepared, options))
}

/**
 * Send one short blob or form with XMLHttpRequest. Browser only.
 *
 * `onProgress` is `xhr.upload.onprogress`. It fires while the body is uploading,
 * before the response. The host must provide `XMLHttpRequest`. Without that
 * constructor (Node, or any other runtime that has none) the promise rejects
 * with "uploadBlobWithProgress needs XMLHttpRequest". It does not fall back
 * to fetch. Use `uploadBlob` there.
 *
 * `credentials` is the same option `uploadBlob` reads. `"include"` sets
 * `withCredentials`. That flag only affects cross-origin requests. Same-origin
 * XHR sends cookies either way.
 *
 * `maxBytes` and `size` are the same check `uploadBlob` runs, before any
 * request. A Blob is measured by its own `size`. FormData uses the explicit
 * `size`. The presigned PUT and the refusal shape match `uploadBlob` too.
 */
export function uploadBlobWithProgress<T>(url: string, body: Blob | FormData, options: BlobUploadOptions = {}): Promise<T> {
	return begin(body, options).then((prepared) => sendUploadWithProgress<T>(url, prepared, options))
}
