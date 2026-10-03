import type { ChaayaError } from "../error.js"
import type { JobProgress } from "../progress.js"
import type { ReconnectOptions } from "../sse/reconnect.js"
import type { NamedEvent } from "../sse/frame.js"

/** Where one stream stands. Connecting covers the first attempt, live covers
 * an open stream, reconnecting covers a retry, failed covers a stream that
 * gave up, and closed covers a watch that ended. */
export type JobConnection = "connecting" | "live" | "reconnecting" | "failed" | "closed"

/** What one named frame does to the published reading. */
export type JobFrameAction =
	| { kind: "ignore" }
	| { kind: "progress"; reading: JobProgress }
	| { kind: "terminal"; reading?: JobProgress; error?: ChaayaError }

/** Map one named frame to an action. */
export type JobFrameHandler = (frame: NamedEvent) => JobFrameAction

/** What one stream needs. The map is the backend. The loop is not. */
export interface JobStreamOptions {
	/** The event stream to follow. */
	url: string
	/** Handlers keyed by event name. A name that is missing is ignored. */
	frameMap: Record<string, JobFrameHandler>
	/** Read current progress once a connection is live. A rejection leaves the stream alone.
	 * The returned promise is the one the freshness check waits on. Do not wrap it in
	 * another async function if the caller needs the reading in that same turn. */
	fetchState?: () => Promise<JobProgress>
	/** Rewrite the catch-up value before the freshness check. Return undefined to skip it.
	 * This runs in the same turn as `fetchState`'s promise. */
	prepareState?: (reading: JobProgress) => JobProgress | undefined
	/** Whether a catch-up reading ends the watch. Core has no terminal enum of its own. */
	isTerminal?: (reading: JobProgress) => boolean
	/** Refuse a frame before the map runs. Return false to drop it. */
	shouldAccept?: (frame: NamedEvent) => boolean
	/** Runs after a catch-up reading is applied. */
	onState?: (reading: JobProgress) => void
	/** Runs when a dropped stream opens again. It receives the new count. */
	onReconnect?: (count: number) => void
	/** The reconnect schedule. Omit for the shared default of 500 ms, 8000 ms, and 6 attempts. */
	reconnect?: ReconnectOptions
	/** Extra fetch fields. An adapter passes `headers` and `credentials` here
	 * for auth and does not fork the loop. `accept` is always
	 * `text/event-stream`. `signal` is ignored. The stream owns the abort. */
	requestInit?: RequestInit
}
