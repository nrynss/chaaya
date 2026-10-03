/** A progress reading a view can render. Names and totals are the
 * producer's. This shape lists no event names and no terminal set.
 *
 * `id` is optional. A backend that does not assign job ids omits it. Core
 * never fills one in.
 *
 * `status` is a freeform string. Core does not treat any value as terminal.
 * An app may use `pending`, `queued`, `running`, `done`, and `error`. That
 * set is a convention, not a requirement. */
export interface JobProgress {
	/** The job, when the producer named one. Omit it when there is no id. */
	id?: string
	/** The step the job is on. Any string. */
	stage?: string
	/** Work done so far. */
	current?: number
	/** Work the job totals. */
	total?: number
	/** A status string the producer chose. Not an enum. */
	status?: string
	/** Extra detail the app alone reads. */
	detail?: unknown
}
