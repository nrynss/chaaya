/**
 * Chaaya audio. Microphone capture in compressed and PCM modes, playback
 * through one element unlocked by the first gesture, arriving PCM blocks, and
 * live levels and waveform peaks.
 *
 * Chunked upload speaks Keel's protocol and lives on `@nrynss/chaaya/keel`,
 * not here.
 *
 * Importing this module does no DOM work. Consumers construct the recorder,
 * the player, or the level meter when they need it.
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
