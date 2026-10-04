import type { CaptureResult } from "../capture/types.js"
import { nextRecordingPhase, type RecordingPhase } from "./phase.js"

/** Why a session command was refused before it changed the phase. */
export type RecordingSessionCode = "illegal" | "busy" | "pause_unsupported" | "empty_take"

/**
 * A command the current phase does not allow, a second start while the first
 * is still opening the microphone, a pause the capture port does not offer,
 * or a stop that produced no bytes.
 */
export class RecordingSessionError extends Error {
	readonly code: RecordingSessionCode
	readonly phase: RecordingPhase

	constructor(code: RecordingSessionCode, phase: RecordingPhase, message: string) {
		super(message)
		this.name = "RecordingSessionError"
		this.code = code
		this.phase = phase
	}
}

/** `stop`, `start`, or `reset` lost the race to `cancel` or `reset`. The
 * phase is already the winner's phase. This is not a capture failure. */
export class RecordingCancelled extends Error {
	readonly code = "cancelled"

	constructor() {
		super("The recording session was cancelled.")
		this.name = "RecordingCancelled"
	}
}

/**
 * The microphone port a session drives. `AudioRecorder` satisfies it through
 * `captureFromRecorder`. A port that can pause implements `pause` and
 * `resume`. A port that omits them cannot be paused, and the session says so
 * instead of pretending the take held still.
 */
export interface RecordingCapture {
	/** Open the microphone and start a take. Throw when the grant fails hard.
	 * A grant that resolves without throwing must still report `running`. */
	start(): Promise<void>
	/** True when a take is on and `stop` will finish it. */
	running(): boolean
	/** End the take and resolve once `take` can be read. */
	stop(): Promise<void>
	/** Hold the take without ending it. Omit when the port cannot pause. */
	pause?(): void | Promise<void>
	/** Continue a held take. Required when `pause` is present. */
	resume?(): void | Promise<void>
	/** Drop the device and any buffered take. */
	reset(): void
	/** The finished bytes, or null when the port kept nothing. */
	take(): CaptureResult | null
	/** The capture failure behind a start that resolved but is not running. */
	captureError(): unknown
}

/**
 * Where a finished take goes. The session does not know the URL, the method,
 * or the envelope. Honour `signal`: a cancel aborts it, and a late resolve
 * after the abort is ignored.
 */
export interface RecordingUpload {
	send(result: CaptureResult, signal: AbortSignal): Promise<void>
}

/** What `createRecordingSession` needs. */
export interface RecordingSessionOptions {
	readonly capture: RecordingCapture
	readonly upload: RecordingUpload
}

/** A headless take. Subscribe to paint. The methods are the only moves. */
export interface RecordingSession {
	readonly phase: RecordingPhase
	/** The last start or upload failure, or null. A cancel clears it. */
	readonly error: unknown
	/** The bytes handed to upload, or null before that, after cancel, and
	 * after reset. A failed upload keeps them so the caller can retry. */
	readonly result: CaptureResult | null
	/** Open the microphone. Resolves once the phase is `recording`. */
	start(): Promise<void>
	/** Hold a running take. Rejects when the capture port cannot pause. */
	pause(): Promise<void>
	/** Continue a held take. */
	resume(): Promise<void>
	/** End the take and upload it. Resolves once the phase is `done`. */
	stop(): Promise<void>
	/** Drop a running, paused, uploading, or still-opening take. */
	cancel(): void
	/** Return to `idle` from any phase, including a finished one. */
	reset(): void
	/** Hear phase, error, and result changes. The listener must not start
	 * another command on this session. */
	subscribe(listener: (phase: RecordingPhase) => void): () => void
}

function refused(code: RecordingSessionCode, phase: RecordingPhase, message: string): RecordingSessionError {
	return new RecordingSessionError(code, phase, message)
}

/**
 * Drive one take from idle through upload.
 *
 * The phase stays `idle` while `start` waits on the microphone. A second
 * start in that window throws `busy`. Cancel in that window lands on
 * `cancelled` even though the public table has no cancel from `idle`: the
 * table describes a phase that has already been entered, and the grant has
 * not entered `recording` yet.
 *
 * `AudioRecorder` has no pause. `captureFromRecorder` therefore omits
 * `pause` and `resume`, and `pause` throws `pause_unsupported` while the
 * phase stays `recording`. A port that can hold a take implements both.
 *
 * Nothing here touches a browser global. The capture port does that, if
 * anything does.
 */
export function createRecordingSession(options: RecordingSessionOptions): RecordingSession {
	const capture = options.capture
	const upload = options.upload
	let phase: RecordingPhase = "idle"
	let error: unknown = null
	let result: CaptureResult | null = null
	let generation = 0
	let arming = false
	let uploadAbort: AbortController | null = null
	const listeners = new Set<(phase: RecordingPhase) => void>()

	function notify(): void {
		for (const listener of [...listeners]) {
			try {
				listener(phase)
			} catch {
				// A painting listener must not rewrite the take.
			}
		}
	}

	function settle(next: RecordingPhase): void {
		phase = next
		notify()
	}

	// settle writes phase, but a method has already narrowed the binding to the
	// phase at entry. Reading it back here keeps the failure rethrow type-true.
	function storedPhase(): RecordingPhase {
		return phase
	}

	function stale(op: number): boolean {
		return op !== generation
	}

	async function start(): Promise<void> {
		if (arming) {
			throw refused("busy", phase, "A start is already opening the microphone.")
		}
		if (phase !== "idle") {
			throw refused("illegal", phase, `Cannot start from ${phase}.`)
		}
		arming = true
		const op = ++generation
		try {
			await capture.start()
			if (stale(op)) {
				capture.reset()
				throw new RecordingCancelled()
			}
			if (!capture.running()) {
				const cause = capture.captureError() ?? new Error("The take did not start.")
				error = cause
				settle(nextRecordingPhase(phase, "fail"))
				throw cause
			}
			error = null
			settle(nextRecordingPhase(phase, "start"))
		} catch (cause) {
			if (stale(op) || cause instanceof RecordingCancelled) {
				if (stale(op)) capture.reset()
				throw cause instanceof RecordingCancelled ? cause : new RecordingCancelled()
			}
			if (storedPhase() === "failed") throw cause
			error = cause
			settle(nextRecordingPhase(phase, "fail"))
			throw cause
		} finally {
			arming = false
		}
	}

	async function pause(): Promise<void> {
		if (phase !== "recording") {
			throw refused("illegal", phase, `Cannot pause from ${phase}.`)
		}
		if (!capture.pause) {
			throw refused(
				"pause_unsupported",
				phase,
				"This capture port cannot pause. The take is still recording."
			)
		}
		const op = generation
		await capture.pause()
		if (stale(op)) throw new RecordingCancelled()
		if (phase !== "recording") return
		settle(nextRecordingPhase(phase, "pause"))
	}

	async function resume(): Promise<void> {
		if (phase !== "paused") {
			throw refused("illegal", phase, `Cannot resume from ${phase}.`)
		}
		if (!capture.resume) {
			throw refused(
				"pause_unsupported",
				phase,
				"This capture port cannot resume. The take is still paused."
			)
		}
		const op = generation
		await capture.resume()
		if (stale(op)) throw new RecordingCancelled()
		if (phase !== "paused") return
		settle(nextRecordingPhase(phase, "resume"))
	}

	async function stop(): Promise<void> {
		if (phase !== "recording" && phase !== "paused") {
			throw refused("illegal", phase, `Cannot stop from ${phase}.`)
		}
		const op = ++generation
		const abort = new AbortController()
		uploadAbort = abort
		settle(nextRecordingPhase(phase, "stop"))
		try {
			await capture.stop()
			if (stale(op)) {
				capture.reset()
				throw new RecordingCancelled()
			}
			const take = capture.take()
			if (!take) {
				const cause = refused("empty_take", phase, "The take ended with no audio to upload.")
				error = cause
				settle(nextRecordingPhase(phase, "fail"))
				throw cause
			}
			result = take
			notify()
			await upload.send(take, abort.signal)
			if (stale(op)) throw new RecordingCancelled()
			error = null
			settle(nextRecordingPhase(phase, "uploaded"))
		} catch (cause) {
			if (stale(op) || abort.signal.aborted) {
				throw cause instanceof RecordingCancelled ? cause : new RecordingCancelled()
			}
			if (storedPhase() === "failed") throw cause
			error = cause
			settle(nextRecordingPhase(phase, "fail"))
			throw cause
		} finally {
			if (uploadAbort === abort) uploadAbort = null
		}
	}

	function cancel(): void {
		if (phase === "idle" && !arming) {
			throw refused("illegal", phase, "Cannot cancel from idle.")
		}
		if (phase === "done" || phase === "failed" || phase === "cancelled") {
			throw refused("illegal", phase, `Cannot cancel from ${phase}.`)
		}
		generation += 1
		arming = false
		uploadAbort?.abort()
		capture.reset()
		result = null
		error = null
		if (phase === "idle") {
			// The grant has not entered recording, so the table would ignore
			// cancel. The session still owes the caller a terminal phase.
			phase = "cancelled"
			notify()
			return
		}
		settle(nextRecordingPhase(phase, "cancel"))
	}

	function reset(): void {
		generation += 1
		arming = false
		uploadAbort?.abort()
		capture.reset()
		result = null
		error = null
		settle(nextRecordingPhase(phase, "reset"))
	}

	function subscribe(listener: (phase: RecordingPhase) => void): () => void {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}

	return {
		get phase() {
			return phase
		},
		get error() {
			return error
		},
		get result() {
			return result
		},
		start,
		pause,
		resume,
		stop,
		cancel,
		reset,
		subscribe
	}
}
