/**
 * Microphone capture behind one recorder. The compressed mode hands back an
 * encoded webm or mp4, the PCM mode hands back a WAV built from raw frames,
 * and both share one lifecycle and one set of device options.
 */
export { AudioRecorder } from "./recorder.svelte.js"
export type { CaptureChunk, CaptureMode, CaptureOptions, CaptureResult, CaptureState } from "./types.js"
