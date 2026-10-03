/** A progress reading a view can render. Names and totals are the
 * producer's. This shape lists no event names and no terminal set. */
export interface JobProgress {
	/** The job, when the producer named one. */
	id?: string
	/** The step the job is on. Any string. */
	stage?: string
	/** Work done so far. */
	current?: number
	/** Work the job totals. */
	total?: number
	/** A status string the producer chose. */
	status?: string
	/** Extra detail the app alone reads. */
	detail?: unknown
}
