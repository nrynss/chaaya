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
	/**
	 * The context the PCM mode records on. The recorder never closes a
	 * supplied context. Compressed mode ignores it, because MediaRecorder
	 * runs without a context.
	 */
	readonly context?: AudioContext
	/**
	 * Ask the device to cancel echo, on by default. Keep echo on and turn
	 * noise suppression and gain control off for a session that also runs
	 * a voice model.
	 */
	readonly echoCancellation?: boolean
	/**
	 * Ask the device to suppress background noise, on by default. Keep echo
	 * on and turn noise suppression and gain control off for a session that
	 * also runs a voice model.
	 */
	readonly noiseSuppression?: boolean
	/**
	 * Ask the device to level the input gain, on by default. Keep echo on
	 * and turn noise suppression and gain control off for a session that
	 * also runs a voice model.
	 */
	readonly autoGainControl?: boolean
	/** The PCM block size in frames, 4096 by default. */
	readonly chunkFrames?: number
	/** How long a take runs before it stops itself, 12 seconds by default. */
	readonly autoStopSeconds?: number
	/**
	 * A listener for every PCM block as it arrives, in order. The recorder
	 * calls it on the main thread and never waits for it, so hand the block
	 * on and return. A slow listener stalls the interface, because the call
	 * runs beside rendering. Compressed takes hold no blocks, so the listener
	 * never fires there.
	 */
	readonly onChunk?: (chunk: CaptureChunk) => void
	/**
	 * Whether the recorder keeps every PCM block until the take stops, true
	 * by default. With false the recorder drops each block after the listener
	 * returns, chunks stays empty and result is null, because the caller holds
	 * the audio. A long session streams this way instead of accumulating.
	 * Compressed takes hold no blocks, so this changes nothing there.
	 */
	readonly retain?: boolean
}
