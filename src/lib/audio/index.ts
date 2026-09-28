/**
 * Chaaya audio. Microphone capture in compressed and PCM modes, chunked
 * upload that survives a network drop and a reload, playback through one
 * element unlocked by the first gesture, and live levels and waveform peaks.
 *
 * Importing this module does no DOM work. Consumers construct the recorder,
 * the uploader, the player, or the level meter when they need it.
 *
 * The re-exports name the .js extension. A plain node import resolves a
 * literal path and never searches for an extension, so the built barrel needs
 * that name to load.
 */
export { AudioRecorder, encodeWav, resampleChunks, resampleLinear } from "./capture/index.js"
export type {
	CaptureChunk,
	CaptureMode,
	CaptureOptions,
	CaptureResult,
	CaptureState
} from "./capture/index.js"
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
export { AudioPlayer } from "./playback/player.svelte.js"
export type { BufferedSpan, PlaybackError, PlaybackFailure, PlayRefusal } from "./playback/player.svelte.js"
export { PcmStreamPlayer } from "./playback/stream.svelte.js"
export type { ScheduledBlock, StreamPlayerOptions } from "./playback/stream.svelte.js"
export { LiveLevel } from "./levels/live-level.svelte.js"
export {
	measureAnalyser,
	measureBlock,
	peakAmplitude,
	QUIET_DB,
	rmsAmplitude,
	toDbfs
} from "./levels/measure.js"
export type { Level } from "./levels/measure.js"
export { computePeaks } from "./levels/peaks.js"
export type { Peaks, PeaksRequest } from "./levels/peaks.js"
export { computePeaksInWorker } from "./levels/peaks-client.js"
