/**
 * The Keel adapter. Error envelopes, job frames, the job stream, and the
 * chunked upload protocol live here. The job stream is the core loop with
 * Keel's frame map. Generic Chaaya modules do not import this folder.
 * Shapes were checked against Keel v0.4.0.
 *
 * Import `api` from this path when a refusal should keep Keel's stable code.
 * The client at `@nrynss/chaaya/api` leaves an unparsed body as http_error.
 */
export { ApiError } from "../../core/api.js"
export type { ApiRequestInit } from "../../core/api.js"
export { api, keelErrorParser } from "./api.js"
export {
	parseErrorEnvelope,
	parseJobEvent,
	parseJobEventFromNamed
} from "./wire/index.js"
export type {
	ErrorBody,
	ErrorEnvelope,
	ErrorEvent,
	HeartbeatEvent,
	JobEvent,
	ParseFailure,
	ParseResult,
	ProgressEvent,
	StatusEvent
} from "./wire/index.js"
export { JobFollower, JobStream, isTerminalStatus, keelFrameMap, toJobProgress } from "./job/index.js"
export type { JobConnection, JobError, JobReport, JobSnapshot, JobStatus, JobStreamOptions } from "./job/index.js"
export {
	ChunkBuffer,
	ChunkUploader,
	IndexedDbStore,
	UploadFailure,
	beginBody,
	chunkPath,
	completeBody,
	completePath,
	isRetryableStatus,
	parseUploadReceipt,
	parseUploadSnapshot,
	refusal,
	retryDelayMs,
	sha256Hex,
	toUploadFailure,
	uploadPath
} from "./upload/index.js"
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
} from "./upload/index.js"
