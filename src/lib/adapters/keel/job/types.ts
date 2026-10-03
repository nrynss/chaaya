import type { ReconnectOptions } from "../../../core/sse/reconnect.js"

/** The status a job holds. Queued and running are live, and the rest are
 * terminal. */
export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled" | "interrupted"

export type { JobConnection } from "../../../core/job/types.js"

/** The error a failed job carries. It mirrors the envelope a failed request
 * carries, so a consumer reads both the same way. */
export interface JobError {
	/** The stable code a consumer branches on. */
	code: string
	/** A sentence a consumer may show and never branch on. */
	message: string
	/** Detail the app alone reads. */
	detail?: unknown
}

/** The state of one job at the moment a read served it. */
export interface JobSnapshot {
	/** The job the read reports on. */
	jobId: string
	/** The status the job held when the read ran. */
	status: JobStatus
	/** The step the job runs. Absent when the producer omits it. */
	stage?: string
	/** The work done so far. Absent when the producer omits it. */
	current?: number
	/** The work the job totals. Absent when the producer omits it. */
	total?: number
	/** The error of a failed job. Absent while the job lives. */
	error?: JobError
}

/** What one stream needs to follow a job. */
export interface JobStreamOptions {
	/** The event stream of one job. */
	url: string
	/** Read the job's current state. It runs once per connection and only
	 * after the stream opens. */
	fetchState: () => Promise<JobSnapshot>
	/** Run when a dropped stream opens again. It receives the new count. */
	onReconnect?: (count: number) => void
	/** The reconnect schedule. Omit for the shared default of 500 ms, 8000 ms, and 6 attempts. */
	reconnect?: ReconnectOptions
}
