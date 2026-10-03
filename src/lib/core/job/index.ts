/**
 * Follow one server-sent stream and publish a progress reading. The caller
 * supplies a frame map. This module names no backend.
 */
export { JobStream } from "./job.svelte.js"
export type { JobConnection, JobFrameAction, JobFrameHandler, JobStreamOptions } from "./types.js"
