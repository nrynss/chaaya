/**
 * Follow one job to its end. A JobStream reads the job's event feed, holds the
 * state a view renders, and stops at the first terminal event. It reads the
 * job's state once per connection to catch up on frames it missed, and it
 * counts the reconnects a consumer may react to.
 *
 * domain.ts maps book and interview events onto job.Progress. See domain.md.
 *
 * The stream opens in a browser alone, so a server may import and construct
 * it. Call attach() from a component to follow the job for that component's
 * life.
 */
export { JobStream } from "./job.svelte.js"
export type { JobConnection, JobError, JobSnapshot, JobStatus, JobStreamOptions } from "./types.js"
export { JobFollower, isTerminalStatus, type JobReport } from "./follow.js"
export {
	bookFailedReading,
	bookReadyReading,
	bookStageReading,
	bookStages,
	interviewEndedReading,
	interviewErrorReading,
	isBookStage,
	narrationUnavailableReading,
	pageApprovedReading,
	questionAudioReading,
	questionReading
} from "./domain.js"
export type { BookStage, DomainReading, ProgressPayload } from "./domain.js"
