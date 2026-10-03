/**
 * Chunked upload of a capture.
 *
 * The uploader splits a capture into fixed size chunks, hashes each chunk with
 * Web Crypto, persists it in IndexedDB, and streams it to Keel's chunked upload
 * protocol. This module is the Keel adapter, not a generic audio helper. A failed chunk retries with backoff, the upload survives a short
 * network drop, and a reloaded page resumes the upload it left behind.
 */
export { ChunkUploader } from "./upload.svelte.js"
export { IndexedDbStore } from "./store.js"
export {
	UploadFailure,
	beginBody,
	chunkPath,
	completeBody,
	completePath,
	parseUploadReceipt,
	parseUploadSnapshot,
	refusal,
	toUploadFailure,
	uploadPath
} from "./protocol.js"
export { ChunkBuffer, sha256Hex } from "./chunk.js"
export { isRetryableStatus, retryDelayMs } from "./retry.js"
export type {
	SessionRecord,
	StoredChunk,
	UploadChunk,
	UploadError,
	UploadOptions,
	UploadReceipt,
	UploadSnapshot,
	UploadState,
	UploadStore
} from "./types.js"
