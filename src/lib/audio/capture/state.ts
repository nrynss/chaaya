import type { CaptureState } from "./types"

/**
 * The lifecycle of a take as one table. Every move the recorder makes between
 * states goes through this function, so the transitions read in one place and
 * a check can drive them without a browser.
 */

/** A move the recorder may make on a take. */
export type CaptureEvent =
	/** The caller opens the microphone. */
	| "start"
	/** The browser granted the microphone and the take is running. */
	| "granted"
	/** The browser refused the grant. */
	| "denied"
	/** The device went away or the recorder could not start. */
	| "failed"
	/** The take finished and its recording is ready. */
	| "finished"
	/** The caller dropped the take. */
	| "reset"

/** The state a take lands in after an event. An event outside its state
 * leaves the state alone, so a late event never rewrites a finished take. */
export function nextState(state: CaptureState, event: CaptureEvent): CaptureState {
	switch (event) {
		case "start":
			return state === "requesting" || state === "recording" ? state : "requesting"
		case "granted":
			return state === "requesting" ? "recording" : state
		case "denied":
			return state === "requesting" ? "denied" : state
		case "failed":
			return state === "requesting" || state === "recording" ? "failed" : state
		case "finished":
			return state === "recording" ? "stopped" : state
		case "reset":
			return "idle"
	}
}
