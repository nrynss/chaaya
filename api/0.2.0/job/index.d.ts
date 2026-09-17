/**
 * Follow one job to its end. A JobStream reads the job's event feed, holds the
 * state a view renders, and stops at the first terminal event. It reads the
 * job's state once per connection to catch up on frames it missed, and it
 * counts the reconnects a consumer may react to.
 *
 * The stream opens in a browser alone, so a server may import and construct
 * it. Call attach() from a component to follow the job for that component's
 * life.
 */
export { JobStream } from "./job.svelte.js";
export type { JobConnection, JobError, JobSnapshot, JobStatus, JobStreamOptions } from "./types.js";
