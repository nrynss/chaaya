import type { CaptureResult, CaptureState } from "../capture/types.js"
import type { RecordingCapture } from "./session.js"

/** The slice of `AudioRecorder` a session needs. The class itself stays in
 * the capture module, so this port does not import a Svelte component. */
export interface RecordingSource {
	start(): Promise<void>
	stop(): Promise<void>
	reset(): void
	readonly state: CaptureState
	readonly result: CaptureResult | null
	readonly error: unknown
}

/**
 * Adapt an `AudioRecorder` to a session.
 *
 * Pause and resume are omitted on purpose. The recorder's lifecycle is
 * idle, requesting, recording, stopped, denied, or failed. It cannot hold
 * a take. `session.pause()` throws `pause_unsupported` until a recorder
 * grows a real hold, for compressed and PCM takes alike.
 */
export function captureFromRecorder(recorder: RecordingSource): RecordingCapture {
	return {
		start: () => recorder.start(),
		stop: () => recorder.stop(),
		reset: () => recorder.reset(),
		running: () => recorder.state === "recording",
		take: () => recorder.result,
		captureError: () => recorder.error
	}
}
