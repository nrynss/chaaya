import type { JobFrameAction } from "../../../core/job/types.js"
import type { JobProgress } from "../../../core/progress.js"
import type { NamedEvent } from "../../../core/sse/frame.js"
import { parseJobEventFromNamed, type ErrorBody, type JobEvent } from "../wire/index.js"
import { type JobFollower, type JobReport } from "./follow.js"

/** Copy an error envelope into the plain shape a view renders. */
function toJobError(body: ErrorBody): { code: string; message: string; detail?: unknown } {
	return body.detail === undefined
		? { code: body.code, message: body.message }
		: { code: body.code, message: body.message, detail: body.detail }
}

/** The job report inside one named frame, or undefined when it is not one.
 * Comment heartbeats never arrive here: core drops them before the map. */
function keelReport(frame: NamedEvent): JobReport | undefined {
	const parsed = parseJobEventFromNamed(frame)
	if (!parsed.ok) return undefined
	return parsed.value
}

/** Map Keel's event names onto core actions. Any other name is left out, so the core loop ignores it. */
export function keelFrameMap(): Record<string, (frame: NamedEvent) => JobFrameAction> {
	const apply = (frame: NamedEvent): JobFrameAction => {
		const event = keelReport(frame)
		if (event === undefined) return { kind: "ignore" }
		if (event.name === "progress") {
			const reading: JobProgress = { id: event.jobId, stage: event.stage, status: "running" }
			if (event.current !== undefined) reading.current = event.current
			if (event.total !== undefined) reading.total = event.total
			if (event.detail !== undefined) reading.detail = event.detail
			return { kind: "progress", reading }
		}
		if (event.name === "error") {
			return {
				kind: "terminal",
				reading: { id: event.jobId, status: "error" },
				error: toJobError(event.error.error),
			}
		}
		return { kind: "terminal", reading: { id: event.jobId, status: event.status } }
	}
	return {
		progress: apply,
		done: apply,
		cancelled: apply,
		interrupted: apply,
		error: apply,
	}
}

/** Whether the follower would keep this frame. This does not record it.
 * The stream pushes the report from `keelOnAccept` only after the action is progress or terminal. */
export function keelShouldAccept(follower: JobFollower, frame: NamedEvent): boolean {
	const report = keelReport(frame)
	if (report === undefined) return false
	return follower.allows(report)
}

/** Record one frame the core stream kept, and return it for the Keel event list. */
export function keelOnAccept(follower: JobFollower, frame: NamedEvent): JobEvent | undefined {
	const report = keelReport(frame)
	if (report === undefined) return undefined
	if (!follower.accept(report)) return undefined
	return report
}
