/**
 * Follow one server-sent stream and publish a progress reading. The caller
 * supplies a frame map. This module names no backend.
 *
 * The follow loop lives in `JobStream`. `createJobStream` is the same stream
 * in factory form. Adapters and apps may use either.
 */
import { JobStream } from "./job.svelte.js"
import type { JobConnection, JobFrameAction, JobFrameHandler, JobStreamOptions } from "./types.js"

/** Factory form of the same stream. Adapters and apps may use either. */
export function createJobStream(options: JobStreamOptions): JobStream {
	return new JobStream(options)
}

export { JobStream }
export type { JobConnection, JobFrameAction, JobFrameHandler, JobStreamOptions }
