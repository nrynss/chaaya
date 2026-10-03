import { JobStream as CoreJobStream } from "../../../core/job/job.svelte.js"
import type { JobCatchUp } from "../../../core/job/types.js"
import type { JobProgress } from "../../../core/progress.js"
import { isTerminalStatus, JobFollower } from "./follow.js"
import { keelFrameMap, keelOnAccept, keelShouldAccept } from "./map.js"
import { toJobProgress } from "./progress.js"
import type { JobEvent } from "../wire/index.js"
import type { JobConnection, JobError, JobStatus, JobStreamOptions } from "./types.js"

/** Follow one Keel job to its end over that job's event feed.
 *
 * The read loop, the reconnect schedule, and the catch-up freshness rule live
 * in the core stream. This class supplies Keel's frame map and the follower
 * that drops duplicates and frames for another job. A snapshot becomes a
 * catch-up: progress in `reading`, and the snapshot error beside it. The
 * fields below are the ones a Keel view already reads.
 *
 * Construction touches nothing, so importing this module on a server is safe.
 * attach() opens the stream, and a component calls it during initialisation.
 */
export class JobStream {
	#events = $state<JobEvent[]>([])
	#follower = new JobFollower()
	#core: CoreJobStream

	constructor(options: JobStreamOptions) {
		const follower = this.#follower
		this.#core = new CoreJobStream({
			url: options.url,
			frameMap: keelFrameMap(),
			/** Translate the snapshot on its own promise. Callers still pass `() => Promise<JobSnapshot>`. */
			fetchState: () =>
				options.fetchState().then((snapshot): JobCatchUp => {
					const catchUp: JobCatchUp = { reading: toJobProgress(snapshot) }
					if (snapshot.error !== undefined) catchUp.error = snapshot.error
					return catchUp
				}),
			prepareState: (catchUp) => {
				const id = catchUp.reading.id
				if (follower.jobId !== undefined && follower.jobId !== id) return undefined
				if (follower.ended) return undefined
				return catchUp
			},
			isTerminal: (reading: JobProgress) => {
				if (reading.status === undefined) return false
				return isTerminalStatus(reading.status as JobStatus)
			},
			shouldAccept: (frame) => keelShouldAccept(follower, frame),
			onAccept: (frame) => {
				const event = keelOnAccept(follower, frame)
				if (event !== undefined) this.#events.push(event)
			},
			onReconnect: options.onReconnect,
			reconnect: options.reconnect,
			requestInit: options.requestInit,
		})
	}

	/** The status of the job. It starts queued and stops at the first terminal. */
	get status(): JobStatus {
		const status = this.#core.progress.status
		return (status as JobStatus | undefined) ?? "queued"
	}

	/** The step the job runs, or undefined before the first reading. */
	get stage(): string | undefined {
		return this.#core.progress.stage
	}

	/** The work done so far, or undefined before the first reading. */
	get current(): number | undefined {
		return this.#core.progress.current
	}

	/** The work the job totals, or undefined before the first reading. */
	get total(): number | undefined {
		return this.#core.progress.total
	}

	/** The error of a failed job, or undefined while the job lives. */
	get error(): JobError | undefined {
		return this.#core.error
	}

	/** Where the stream stands. */
	get connection(): JobConnection {
		return this.#core.connection
	}

	/** The count of dropped streams that opened again. */
	get reconnects(): number {
		return this.#core.reconnects
	}

	/** Every frame the core stream kept, in arrival order, as Keel events.
	 * Ignored and refused frames are not here. A component that mounts after
	 * the first frames still reads them here. Core `frames` is the same accept
	 * set as raw named events; Keel views read this list. */
	get events(): JobEvent[] {
		return this.#events
	}

	/** Follow the job. Call it once during component initialisation. The
	 * stream opens before the first render, and it closes when that component
	 * is destroyed. A test passes its own cleanup runner, because only a
	 * component owns the effect context the default runner needs. */
	attach(registerCleanup?: (task: () => () => void) => void): void {
		this.#core.attach(registerCleanup)
	}

	/** Stop following the job. It cancels the stream and any pending reconnect. A second call changes nothing. */
	close(): void {
		this.#core.close()
	}
}
