import { ApiError, type ApiErrorParser } from "../core/api.js"
import { prepareUpload, reportUploadProgress, uploadFailure } from "../core/upload-blob.js"

/** One finished part the completion call carries. */
export interface DirectCompletedPart {
	/** One based part number. */
	partNumber: number
	/** Store receipt the part PUT answered with. */
	etag: string
}

/** One part range inside a blob. End is exclusive. */
export interface DirectPartRange {
	/** One based part number. */
	partNumber: number
	/** First byte of the part. */
	start: number
	/** One past the last byte of the part. */
	end: number
}

/** Caller supplied session URLs. The module names no route and no store. */
export interface DirectUploadProviders<T> {
	/** Open a session and hand back its id. */
	create(): Promise<{ uploadId: string }>
	/** Presigned URL for one part number. */
	partUrl(uploadId: string, partNumber: number): Promise<string> | string
	/** Close the session after every part lands. */
	complete(uploadId: string, parts: DirectCompletedPart[]): Promise<T>
	/** Abandon the session. Omit when the backend needs no abort. */
	abort?(uploadId: string): Promise<void>
}

/** Options for one raw PUT straight to a caller supplied URL. */
export interface DirectBlobOptions {
	/** Extra headers. Omit Authorization unless the signer asked for it. */
	headers?: HeadersInit
	/** Cookie policy. Omit it and the transport keeps its default. */
	credentials?: RequestCredentials
	/** Abort the request. */
	signal?: AbortSignal
	/** Give up after this many milliseconds. Omit for no deadline. */
	timeoutMs?: number
	/** Bytes handed to the socket, and the total when one is known. */
	onProgress?: (loaded: number, total: number) => void
	/** Read a refused body. Omit and a non-2xx stays http_error. */
	parseError?: ApiErrorParser
}

/** Options for a multipart session over caller supplied URLs. */
export interface DirectMultipartOptions extends DirectBlobOptions {
	/** Longest part in bytes. Must be a positive integer. */
	partSize: number
	/** Attempts per part before the session gives up. Default 6. */
	maxAttempts?: number
	/** Parts already stored. The session skips them. */
	completed?: readonly DirectCompletedPart[]
	/** Delay before the attempt after the given one. Defaults to the backoff below. */
	retryDelay?: (attempt: number) => number | null
	/** Wait helper. Defaults to a setTimeout promise. Tests inject a no wait clock. */
	wait?: (ms: number) => Promise<void>
	/** Fires when one part lands, in part order. */
	onPart?: (part: DirectCompletedPart) => void
}

/** Delay before the second attempt, in milliseconds. */
export const directRetryBaseMs = 250

/** Ceiling the delay doubles up to, in milliseconds. */
export const directRetryMaxMs = 2000

/** Attempts one part gets before the session gives up. */
export const directRetryMaxAttempts = 6

/**
 * Delay before the attempt after the given one. The delay doubles from the
 * base and stops at the ceiling. Null means the attempts are spent, so the
 * caller gives up instead of waiting.
 */
export function directRetryDelayMs(attempt: number): number | null {
	if (attempt < 1 || attempt >= directRetryMaxAttempts) return null
	return Math.min(directRetryBaseMs * 2 ** (attempt - 1), directRetryMaxMs)
}

/**
 * Whether a refused part is worth another attempt. A status of 408, 429, or
 * 5xx names a receiver that is busy or broken, so the same PUT may land
 * later. Every other status is an answer, and a second PUT repeats it.
 */
export function isDirectRetryableStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500
}

/**
 * Split a byte length into one based part ranges. The last range is short
 * when the length is no multiple of the part size. An empty blob yields one
 * empty range, so the session still sends one PUT and completes.
 */
export function directPartRanges(size: number, partSize: number): DirectPartRange[] {
	if (!Number.isInteger(size) || size < 0) {
		throw new RangeError("size must be a non-negative integer byte length")
	}
	if (!Number.isInteger(partSize) || partSize <= 0) {
		throw new RangeError("partSize must be a positive integer byte length")
	}
	if (size === 0) return [{ partNumber: 1, start: 0, end: 0 }]
	const ranges: DirectPartRange[] = []
	let partNumber = 1
	for (let start = 0; start < size; start += partSize) {
		ranges.push({ partNumber, start, end: Math.min(start + partSize, size) })
		partNumber += 1
	}
	return ranges
}

/**
 * Part numbers that still need a PUT. The result is sorted and holds no
 * duplicates. Numbers outside one through partCount fall away, so a stale
 * receipt cannot schedule a part the session never created.
 */
export function remainingPartNumbers(partCount: number, completed: readonly number[]): number[] {
	if (!Number.isInteger(partCount) || partCount < 0) {
		throw new RangeError("partCount must be a non-negative integer")
	}
	const done = new Set<number>()
	for (const partNumber of completed) {
		if (Number.isInteger(partNumber) && partNumber >= 1 && partNumber <= partCount) done.add(partNumber)
	}
	const remaining: number[] = []
	for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
		if (!done.has(partNumber)) remaining.push(partNumber)
	}
	return remaining
}

/**
 * Add one progress sample to a running total. Finished parts contribute
 * their full size. Live parts contribute the bytes the socket reports.
 */
export function aggregateDirectProgress(finishedBytes: number, liveLoaded: readonly number[]): number {
	let total = finishedBytes
	for (const loaded of liveLoaded) total += loaded
	return total
}

function positiveTimeout(timeoutMs: number | undefined): number | undefined {
	if (timeoutMs === undefined) return undefined
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new RangeError("timeoutMs must be a positive number of milliseconds, or omitted for no deadline")
	}
	return timeoutMs
}

function xhrHeaders(xhr: XMLHttpRequest): Headers {
	const headers = new Headers()
	const raw = xhr.getAllResponseHeaders?.() ?? ""
	for (const line of raw.split(/\r?\n/)) {
		if (line === "") continue
		const index = line.indexOf(":")
		if (index <= 0) continue
		const name = line.slice(0, index).trim()
		const value = line.slice(index + 1).trim()
		if (name !== "") headers.append(name, value)
	}
	return headers
}

function xhrConstructor(): new () => XMLHttpRequest {
	if (typeof XMLHttpRequest === "undefined") {
		throw new Error("direct upload needs XMLHttpRequest")
	}
	return XMLHttpRequest
}

function abortReason(signal: AbortSignal | undefined): unknown {
	const reason = signal?.reason
	return reason instanceof Error ? reason : new DOMException("The operation was aborted.", "AbortError")
}

/**
 * PUT one raw blob through XMLHttpRequest. Progress is socket progress, so
 * the bar moves while the bytes leave. The promise resolves with the ETag
 * the receiver answered with, or an empty string when it sent none.
 */
export function uploadDirectBlob(url: string, body: Blob, options: DirectBlobOptions = {}): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		let timeoutMs: number | undefined
		let prepared: ReturnType<typeof prepareUpload>
		let XHR: new () => XMLHttpRequest
		try {
			timeoutMs = positiveTimeout(options.timeoutMs)
			prepared = prepareUpload(body, {
				method: "PUT",
				formData: false,
				headers: options.headers,
				credentials: options.credentials,
			})
			XHR = xhrConstructor()
		} catch (cause) {
			reject(cause)
			return
		}
		const xhr = new XHR()
		xhr.open(prepared.method, url)
		prepared.headers.forEach((value, key) => {
			xhr.setRequestHeader(key, value)
		})
		xhr.responseType = "text"
		xhr.withCredentials = options.credentials === "include"
		if (timeoutMs !== undefined) xhr.timeout = timeoutMs
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
				reject(abortReason(signal))
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
				if (xhr.status < 200 || xhr.status >= 300) {
					throw uploadFailure(xhr.status, xhr.statusText, xhr.responseText, xhrHeaders(xhr), options.parseError)
				}
				reportUploadProgress(options.onProgress, prepared.size, prepared.size)
				resolve(xhr.getResponseHeader("etag") ?? "")
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
			reject(abortReason(signal))
		}
		xhr.send(prepared.payload)
	})
}

function defaultWait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

function isRetryableCause(cause: unknown): boolean {
	if (cause instanceof ApiError) {
		if (cause.code === "network" || cause.code === "timeout") return true
		return isDirectRetryableStatus(cause.status)
	}
	return false
}

async function putPartWithRetry(
	url: string,
	slice: Blob,
	options: DirectBlobOptions,
	maxAttempts: number,
	retryDelay: (attempt: number) => number | null,
	wait: (ms: number) => Promise<void>,
	onPartProgress: (loaded: number, total: number) => void,
): Promise<string> {
	let attempt = 0
	for (;;) {
		attempt += 1
		try {
			return await uploadDirectBlob(url, slice, { ...options, onProgress: onPartProgress })
		} catch (cause) {
			if (options.signal?.aborted) throw abortReason(options.signal)
			if (!isRetryableCause(cause)) throw cause
			if (attempt >= maxAttempts) throw cause
			const delay = retryDelay(attempt)
			if (delay === null) throw cause
			if (delay > 0) await wait(delay)
		}
	}
}

/**
 * Upload a blob in parts through caller supplied URLs, then complete.
 *
 * The caller opens the session through create, names each part URL through
 * partUrl, and closes through complete. Parts go in number order, one at a
 * time, so progress stays monotonic and a log reads in order. Parts listed
 * in completed are skipped, so an interrupted session resumes without
 * resending stored bytes. Each part PUT retries busy answers with the
 * backoff above. onProgress reports stored bytes plus live socket bytes.
 */
export async function uploadDirectMultipart<T>(
	blob: Blob,
	providers: DirectUploadProviders<T>,
	options: DirectMultipartOptions,
): Promise<T> {
	if (!(blob instanceof Blob)) throw new TypeError("uploadDirectMultipart needs a Blob body")
	const maxAttempts = options.maxAttempts ?? directRetryMaxAttempts
	if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
		throw new RangeError("maxAttempts must be a positive integer")
	}
	const retryDelay = options.retryDelay ?? directRetryDelayMs
	const wait = options.wait ?? defaultWait
	const { uploadId } = await providers.create()
	const ranges = directPartRanges(blob.size, options.partSize)
	const stored = new Map<number, string>()
	for (const part of options.completed ?? []) {
		if (Number.isInteger(part.partNumber) && part.partNumber >= 1 && part.partNumber <= ranges.length) {
			stored.set(part.partNumber, part.etag)
		}
	}
	const pending = remainingPartNumbers(ranges.length, [...stored.keys()])
	const liveLoaded = new Map<number, number>()
	const finishedBytes = (): number => {
		let total = 0
		for (const range of ranges) {
			if (stored.has(range.partNumber)) total += range.end - range.start
		}
		return total
	}
	const report = () => {
		const live = [...liveLoaded.values()]
		reportUploadProgress(options.onProgress, aggregateDirectProgress(finishedBytes(), live), blob.size)
	}
	try {
		for (const partNumber of pending) {
			if (options.signal?.aborted) throw abortReason(options.signal)
			const range = ranges[partNumber - 1]
			if (range === undefined) throw new RangeError("a part number fell outside its ranges")
			const url = await providers.partUrl(uploadId, partNumber)
			const slice = blob.slice(range.start, range.end, blob.type)
			liveLoaded.set(partNumber, 0)
			const etag = await putPartWithRetry(
				url,
				slice,
				{
					headers: options.headers,
					credentials: options.credentials,
					signal: options.signal,
					timeoutMs: options.timeoutMs,
					parseError: options.parseError,
				},
				maxAttempts,
				retryDelay,
				wait,
				(loaded) => {
					liveLoaded.set(partNumber, loaded)
					report()
				},
			)
			liveLoaded.delete(partNumber)
			stored.set(partNumber, etag)
			report()
			options.onPart?.({ partNumber, etag })
		}
		const parts: DirectCompletedPart[] = ranges.map((range) => ({
			partNumber: range.partNumber,
			etag: stored.get(range.partNumber) ?? "",
		}))
		return await providers.complete(uploadId, parts)
	} catch (cause) {
		if (providers.abort !== undefined) {
			try {
				await providers.abort(uploadId)
			} catch {
				// The first failure decides the outcome, so an abort miss stays silent.
			}
		}
		throw cause
	}
}
