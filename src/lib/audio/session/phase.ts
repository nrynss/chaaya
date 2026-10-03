/**
 * The lifecycle of one recording session as one table. Capture, pause and
 * upload all ask this function before they touch a microphone or a socket, so
 * a check can drive every move without a browser.
 *
 * This is not the microphone table in `capture/state`. That one tracks a
 * grant. This one tracks a take that can pause and then upload.
 */

/** Where a session stands. `failed` and `cancelled` are terminal, the same
 * way `done` is. `reset` is the only way back to `idle`. */
export type RecordingPhase =
	| "idle"
	| "recording"
	| "paused"
	| "uploading"
	| "done"
	| "failed"
	| "cancelled"

/** A move a session may make. A move outside its phase leaves the phase
 * alone, so a late event never rewrites a finished session. */
export type RecordingEvent =
	| "start"
	| "pause"
	| "resume"
	| "stop"
	| "uploaded"
	| "fail"
	| "cancel"
	| "reset"

/** The phase a session lands in after an event. */
export function nextRecordingPhase(phase: RecordingPhase, event: RecordingEvent): RecordingPhase {
	switch (event) {
		case "start":
			return phase === "idle" ? "recording" : phase
		case "pause":
			return phase === "recording" ? "paused" : phase
		case "resume":
			return phase === "paused" ? "recording" : phase
		case "stop":
			return phase === "recording" || phase === "paused" ? "uploading" : phase
		case "uploaded":
			return phase === "uploading" ? "done" : phase
		case "fail":
			return phase === "idle" || phase === "recording" || phase === "paused" || phase === "uploading"
				? "failed"
				: phase
		case "cancel":
			return phase === "recording" || phase === "paused" || phase === "uploading"
				? "cancelled"
				: phase
		case "reset":
			return "idle"
	}
}
