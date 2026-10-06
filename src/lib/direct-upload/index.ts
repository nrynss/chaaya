/**
 * Resumable direct upload straight to caller supplied URLs. The module
 * names no store and no backend. The caller opens a session, names each
 * part URL, and closes the session. Parts travel as raw bodies through
 * XMLHttpRequest, so progress moves while the bytes leave.
 */
export {
	aggregateDirectProgress,
	directPartRanges,
	directRetryDelayMs,
	directRetryBaseMs,
	directRetryMaxAttempts,
	directRetryMaxMs,
	isDirectRetryableStatus,
	remainingPartNumbers,
	uploadDirectBlob,
	uploadDirectMultipart,
} from "./direct-upload.js"
export type {
	DirectBlobOptions,
	DirectCompletedPart,
	DirectMultipartOptions,
	DirectPartRange,
	DirectUploadProviders,
} from "./direct-upload.js"
