/** How a recorder turns a microphone into bytes. */
export type CaptureMode = "compressed" | "pcm"

/**
 * The lifecycle of one take. A take opens the microphone (`requesting`), runs
 * (`recording`), and ends in `stopped`. A refused grant ends in `denied` and a
 * device that disappears ends in `failed`. Both keep whatever was captured.
 */
export type CaptureState = "idle" | "requesting" | "recording" | "denied" | "stopped" | "failed"

/**
 * One block of mono PCM frames and where it sits on the audio clock. The frame
 * offset and the clock reading let two takes align without guessing.
 */
export interface CaptureChunk {
	/** Mono frames in the range -1 to 1. */
	readonly samples: Float32Array
	/** How many frames came before this block on the same take. */
	readonly offset: number
	/** The audio clock reading, in seconds, when the block began. */
	readonly contextTime: number
}

/** A finished take that a consumer can play, upload or store. */
export interface CaptureResult {
	/** The captured audio. */
	readonly blob: Blob
	/** The container type of the blob. */
	readonly mimeType: string
	/** The sample rate of the captured audio, in hertz. */
	readonly sampleRate: number
}

/** The knobs a caller may set on a recorder. */
export interface CaptureOptions {
	/** The capture mode, compressed by default. */
	readonly mode?: CaptureMode
	/** Ask the device to cancel echo, on by default. */
	readonly echoCancellation?: boolean
	/** Ask the device to suppress background noise, on by default. */
	readonly noiseSuppression?: boolean
	/** Ask the device to level the input gain, on by default. */
	readonly autoGainControl?: boolean
	/** The PCM block size in frames, 4096 by default. */
	readonly chunkFrames?: number
	/** How long a take runs before it stops itself, 12 seconds by default. */
	readonly autoStopSeconds?: number
}
