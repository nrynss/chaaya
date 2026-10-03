import type { JobProgress } from "../../../core/progress.js"
import type { JobSnapshot } from "./types.js"

/** Read a Keel job snapshot as the generic progress shape. */
export function toJobProgress(snapshot: JobSnapshot): JobProgress {
	const reading: JobProgress = { id: snapshot.jobId, status: snapshot.status }
	if (snapshot.stage !== undefined) reading.stage = snapshot.stage
	if (snapshot.current !== undefined) reading.current = snapshot.current
	if (snapshot.total !== undefined) reading.total = snapshot.total
	if (snapshot.error !== undefined) reading.detail = snapshot.error
	return reading
}
