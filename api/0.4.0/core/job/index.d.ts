/**
 * Follow one server-sent stream and publish a progress reading. The caller
 * supplies a frame map. This module names no backend.
 *
 * The follow loop lives in `FrameLoop`. `JobStream` maps frames onto a progress
 * reading. `createJobStream` is the same stream in factory form. Adapters and
 * apps may use either. `JobPoller` publishes the same reading by polling
 * where a stream cannot stay open.
 */
import { JobStream } from "./job.svelte.js";
import type { JobCatchUp, JobConnection, JobFrameAction, JobFrameHandler, JobStreamOptions } from "./types.js";
import { JobPoller } from "./poll.svelte.js";
import type { JobPollerOptions } from "./poll.svelte.js";
/** Factory form of the same stream. Adapters and apps may use either. */
export declare function createJobStream(options: JobStreamOptions): JobStream;
/** Factory form of the same poller. Use it where a stream cannot stay open. */
export declare function createJobPoller<T>(options: JobPollerOptions<T>): JobPoller<T>;
export { JobStream, JobPoller };
export type { JobCatchUp, JobConnection, JobFrameAction, JobFrameHandler, JobStreamOptions, JobPollerOptions };
