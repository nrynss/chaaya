import { decodeJson, fail, isRecord, ok, type ParseResult } from "../../../core/result.js"
import { parseErrorEnvelope } from "../wire/index.js"
import { isRetryableStatus } from "./retry.js"
import type { UploadError, UploadReceipt, UploadSnapshot } from "./types.js"

/** A request that did not succeed, and whether another attempt may answer it. */
export class UploadFailure extends Error implements UploadError {
	readonly code: string
	readonly retryable: boolean
	readonly detail?: unknown

	constructor(
		code: string,
		message: string,
		options: { detail?: unknown; retryable?: boolean } = {}
	) {
		super(message)
		this.name = "UploadFailure"
		this.code = code
		this.retryable = options.retryable ?? false
		if (options.detail !== undefined) this.detail = options.detail
	}
}

/**
 * Turn any thrown value into the failure an upload reports. A transport that
 * answered nothing is the network, and the network always deserves another
 * attempt.
 */
export function toUploadFailure(error: unknown): UploadFailure {
	if (error instanceof UploadFailure) return error
	if (error instanceof Error) return new UploadFailure("network", error.message, { retryable: true })
	return new UploadFailure("network", String(error), { retryable: true })
}

/** The body that opens an upload. The size stays undeclared, because a live
 * capture has no known length. */
export function beginBody(options: {
	readonly owner: string
	readonly contentType: string
	readonly visibility: string
	readonly chunkSize: number
}): string {
	return JSON.stringify({
		owner: options.owner,
		content_type: options.contentType,
		visibility: options.visibility,
		chunk_size: options.chunkSize
	})
}

/** The body that completes an upload. */
export function completeBody(sha256: string): string {
	return JSON.stringify({ sha256 })
}

/** The path of one upload. */
export function uploadPath(base: string, id: string): string {
	return `${base}/${id}`
}

/** The path one chunk writes to. */
export function chunkPath(base: string, id: string, index: number): string {
	return `${base}/${id}/chunks/${index}`
}

/** The path that completes one upload. */
export function completePath(base: string, id: string): string {
	return `${base}/${id}/complete`
}

/** Read one body into a JSON object, or fail without throwing. */
function decodeObject(text: string): ParseResult<Record<string, unknown>> {
	const decoded = decodeJson(text)
	if (!decoded.ok) return decoded
	if (!isRecord(decoded.value)) return fail("the body holds no JSON object")
	return ok(decoded.value)
}

/** Read one member as a list of chunk indices. */
function isIndexList(value: unknown): value is number[] {
	return (
		Array.isArray(value) &&
		value.every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0)
	)
}

/** Read one member as a number. */
function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value)
}

/** Parse the state body a begin, a chunk write or a state read returns. */
export function parseUploadSnapshot(body: string): ParseResult<UploadSnapshot> {
	const decoded = decodeObject(body)
	if (!decoded.ok) return decoded
	const value = decoded.value
	const id = value.id
	const owner = value.owner
	const contentType = value.content_type
	const visibility = value.visibility
	const chunkSize = value.chunk_size
	const storedBytes = value.stored_bytes
	const received = value.received
	const missing = value.missing
	const expiresAt = value.expires_at
	if (typeof id !== "string") return fail("the state carries no id string")
	if (typeof owner !== "string") return fail("the state carries no owner string")
	if (typeof contentType !== "string") return fail("the state carries no content type string")
	if (typeof visibility !== "string") return fail("the state carries no visibility string")
	if (!isNumber(chunkSize)) return fail("the state carries no chunk size number")
	if (!isNumber(storedBytes)) return fail("the state carries no stored byte count")
	if (!isIndexList(received)) return fail("the state carries no received index list")
	if (!isIndexList(missing)) return fail("the state carries no missing index list")
	if (typeof expiresAt !== "string") return fail("the state carries no expiry string")
	return ok({
		id,
		owner,
		contentType,
		visibility,
		chunkSize,
		storedBytes,
		received,
		missing,
		expiresAt,
		...(isNumber(value.size_bytes) ? { sizeBytes: value.size_bytes } : {}),
		...(isNumber(value.chunk_count) ? { chunkCount: value.chunk_count } : {})
	})
}

/** Parse the receipt a completed upload returns. */
export function parseUploadReceipt(body: string): ParseResult<UploadReceipt> {
	const decoded = decodeObject(body)
	if (!decoded.ok) return decoded
	const value = decoded.value
	const id = value.id
	const owner = value.owner
	const contentType = value.content_type
	const visibility = value.visibility
	const sizeBytes = value.size_bytes
	const sha256 = value.sha256
	if (typeof id !== "string") return fail("the receipt carries no id string")
	if (typeof owner !== "string") return fail("the receipt carries no owner string")
	if (typeof contentType !== "string") return fail("the receipt carries no content type string")
	if (typeof visibility !== "string") return fail("the receipt carries no visibility string")
	if (!isNumber(sizeBytes)) return fail("the receipt carries no size number")
	if (typeof sha256 !== "string") return fail("the receipt carries no digest string")
	return ok({ id, owner, contentType, visibility, sizeBytes, sha256 })
}

/**
 * Turn a refused response into the failure an upload reports. The envelope
 * carries the stable code every rejection shares, and the status alone decides
 * whether another attempt may answer it.
 */
export async function refusal(response: Response): Promise<UploadFailure> {
	const retryable = isRetryableStatus(response.status)
	const parsed = parseErrorEnvelope(await response.text())
	if (!parsed.ok) {
		return new UploadFailure("http", `the upload answered ${response.status}`, { retryable })
	}
	const body = parsed.value.error
	return new UploadFailure(body.code, body.message, { detail: body.detail, retryable })
}
