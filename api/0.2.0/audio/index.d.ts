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
export { AudioRecorder } from "./capture/index.js";
export type { CaptureChunk, CaptureMode, CaptureOptions, CaptureResult, CaptureState } from "./capture/index.js";
export { ChunkUploader } from "./upload/index.js";
export { IndexedDbStore } from "./upload/index.js";
export { UploadFailure } from "./upload/index.js";
export type { SessionRecord, StoredChunk, UploadChunk, UploadError, UploadOptions, UploadReceipt, UploadSnapshot, UploadState, UploadStore } from "./upload/index.js";
export { AudioPlayer } from "./playback/player.svelte.js";
export type { BufferedSpan, PlaybackError, PlaybackFailure } from "./playback/player.svelte.js";
export { LiveLevel } from "./levels/live-level.svelte.js";
export { measureAnalyser, measureBlock, peakAmplitude, QUIET_DB, rmsAmplitude, toDbfs } from "./levels/measure.js";
export type { Level } from "./levels/measure.js";
export { computePeaks } from "./levels/peaks.js";
export type { Peaks, PeaksRequest } from "./levels/peaks.js";
export { computePeaksInWorker } from "./levels/peaks-client.js";
