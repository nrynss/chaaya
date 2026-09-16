/**
 * The shapes one upload reads and writes. The wire carries snake case names,
 * and this module maps them into the camel case names a caller branches on.
 */

/** Where one upload stands. It opens, streams its chunks, closes out, and
 * ends in done. A refusal that no retry can answer ends in failed. */
export type UploadState = "idle" | "opening" | "streaming" | "finishing" | "done" | "failed"

/** One chunk of a capture, ready to send. */
export interface UploadChunk {
	/** The position of the chunk in the upload, counting from zero. */
	readonly index: number
	/** The bytes the chunk carries. */
	readonly bytes: Uint8Array<ArrayBuffer>
	/** The lowercase hex SHA-256 of those bytes. */
	readonly sha256: string
}

/** What the server holds for one upload, as a read reported it. */
export interface UploadSnapshot {
	/** The id the server gave the upload. */
	readonly id: string
	/** The owner the upload belongs to. */
	readonly owner: string
	/** The container type of the bytes. */
	readonly contentType: string
	/** Who may read the finished upload. */
	readonly visibility: string
	/** The longest chunk the server accepts. */
	readonly chunkSize: number
	/** The total size the caller declared. Absent while it is unknown. */
	readonly sizeBytes?: number
	/** The chunk count the caller declared. Absent while it is unknown. */
	readonly chunkCount?: number
	/** How many bytes the server holds. */
	readonly storedBytes: number
	/** The chunk indices the server holds. */
	readonly received: readonly number[]
	/** The chunk indices the server lacks. */
	readonly missing: readonly number[]
	/** When the upload expires, as the server wrote it. */
	readonly expiresAt: string
}

/** What a finished upload reports. */
export interface UploadReceipt {
	/** The id the server gave the upload. */
	readonly id: string
	/** The owner the upload belongs to. */
	readonly owner: string
	/** The container type of the assembled bytes. */
	readonly contentType: string
	/** Who may read the finished upload. */
	readonly visibility: string
	/** The size of the assembled upload in bytes. */
	readonly sizeBytes: number
	/** The lowercase hex SHA-256 of the assembled upload. */
	readonly sha256: string
}

/** Why one upload stopped. */
export interface UploadError {
	/** The stable code a caller branches on. */
	readonly code: string
	/** A sentence a caller may show but never branch on. */
	readonly message: string
	/** Detail the app alone reads. */
	readonly detail?: unknown
	/** Whether another attempt could have answered it. */
	readonly retryable: boolean
}

/** One chunk as the store keeps it. */
export interface StoredChunk {
	/** The upload the chunk belongs to. */
	readonly id: string
	/** The position of the chunk in the upload, counting from zero. */
	readonly index: number
	/** The lowercase hex SHA-256 of the bytes. */
	readonly sha256: string
	/** The bytes, in a buffer of their own. */
	readonly bytes: ArrayBuffer
}

/** One upload the store keeps, so a reloaded page can pick it up. */
export interface SessionRecord {
	/** The id the server gave the upload. */
	readonly id: string
	/** The collection path the upload belongs to. */
	readonly url: string
	/** The owner the upload belongs to. */
	readonly owner: string
	/** The container type of the bytes. */
	readonly contentType: string
	/** Who may read the finished upload. */
	readonly visibility: string
	/** The longest chunk the upload sends. */
	readonly chunkSize: number
	/** When the upload opened, so the newest session wins. */
	readonly startedAt: number
}

/** The persistence one upload needs. A page uses the IndexedDB store, and a
 * caller may hand in its own. */
export interface UploadStore {
	/** Record an opened upload. */
	putSession(record: SessionRecord): Promise<void>
	/** Read the newest recorded upload, or undefined when none waits. */
	latestSession(): Promise<SessionRecord | undefined>
	/** Forget one upload. */
	deleteSession(id: string): Promise<void>
	/** Record one chunk before it is sent. */
	putChunk(chunk: StoredChunk): Promise<void>
	/** Read every chunk of one upload, in index order. */
	listChunks(id: string): Promise<StoredChunk[]>
	/** Forget every chunk of one upload. */
	deleteChunks(id: string): Promise<void>
}

/** The knobs a caller sets on an upload. */
export interface UploadOptions {
	/** The collection path that opens an upload. */
	readonly url: string
	/** The owner the upload belongs to. */
	readonly owner: string
	/** The container type of the bytes. */
	readonly contentType: string
	/** Who may read the finished upload. Private by default. */
	readonly visibility?: "private" | "public"
	/** The longest chunk to send. 64 KiB by default. */
	readonly chunkSize?: number
	/** Where pending chunks persist. The IndexedDB store by default. */
	readonly store?: UploadStore
}
