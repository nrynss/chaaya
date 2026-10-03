import type { ErrorEvent, ProgressEvent, StatusEvent } from "../wire/index.js"
import type { JobStatus } from "./types.js"

/** One event that reports on a job. A heartbeat carries no job state, so it
 * never reaches this module. */
export type JobReport = ProgressEvent | StatusEvent | ErrorEvent

/** The status names that end a job. */
function endsJob(name: string): boolean {
	switch (name) {
		case "done":
		case "error":
		case "cancelled":
		case "interrupted":
			return true
		default:
			return false
	}
}

/** Whether a status ends the job. */
export function isTerminalStatus(status: JobStatus): boolean {
	return endsJob(status)
}

export { takeFrames } from "../../../core/sse/frame.js"

/** The ordering rules one Keel job stream obeys.
 *
 * This follower is Keel-shaped: it keys on Keel's `jobId`, Keel's report
 * types, and Keel's terminal event names. It does not belong in core. A
 * different backend writes its own `shouldAccept` (or a follower like this
 * one) instead of importing from the Keel adapter.
 *
 * The stream carries frames for one job, and their ids climb. A repeat of an
 * id this follower already read is a duplicate, so it never lands twice. A
 * frame for another job belongs to another stream, so it is refused. The
 * first terminal event ends the job, and every event after it is refused.
 */
export class JobFollower {
	#lastEventId = 0
	#jobId: string | undefined = undefined
	#ended = false

	/** The id of the last frame this follower accepted. Zero before the
	 * first frame that carried one. */
	get lastEventId(): number {
		return this.#lastEventId
	}

	/** The job this follower accepted, or undefined before its first frame. */
	get jobId(): string | undefined {
		return this.#jobId
	}

	/** Whether a terminal event has already been accepted. */
	get ended(): boolean {
		return this.#ended
	}

	/** Whether `accept` would take this event. This does not record it. */
	allows(event: JobReport): boolean {
		if (this.#jobId !== undefined && this.#jobId !== event.jobId) return false
		if (event.id !== 0 && event.id <= this.#lastEventId) return false
		if (this.#ended) return false
		return true
	}

	/** Accept one event, or refuse it as a repeat. A frame with an id this
	 * follower already read, a frame for another job, and a frame after the
	 * terminal all come back false. */
	accept(event: JobReport): boolean {
		if (this.#jobId === undefined) this.#jobId = event.jobId
		else if (this.#jobId !== event.jobId) return false
		if (event.id !== 0 && event.id <= this.#lastEventId) return false
		if (this.#ended) return false
		if (event.id !== 0) this.#lastEventId = event.id
		if (endsJob(event.name)) this.#ended = true
		return true
	}
}
