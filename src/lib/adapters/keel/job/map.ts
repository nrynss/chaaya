import type { JobFrameAction } from "../../../core/job/types.js"
import type { JobProgress } from "../../../core/progress.js"
import { formatNamedFrame, type NamedEvent } from "../../../core/sse/frame.js"
import { parseJobEvent, type ErrorBody, type JobEvent } from "../wire/index.js"
import { type JobFollower, type JobReport } from "./follow.js"

/** Copy an error envelope into the plain shape a view renders. */
function toJobError(body: ErrorBody): { code: string; message: string; detail?: unknown } {
	return body.detail === undefined
		? { code: body.code, message: body.message }
		: { code: body.code, message: body.message, detail: body.detail }
}

/** Rebuild the frame text the Keel parser reads. */
function asText(frame: NamedEvent): string | undefined {
	try {
		return formatNamedFrame({
			id: frame.id === 0 ? undefined : frame.id,
			event: frame.name,
			data: frame.data,
		})
	} catch {
		return undefined
	}
}

/** The job report inside one named frame, or undefined when it is not one. */
function keelReport(frame: NamedEvent): JobReport | undefined {
	const text = asText(frame)
	if (text === undefined) return undefined
	const parsed = parseJobEvent(text)
	if (!parsed.ok) return undefined
	if (parsed.value.name === "heartbeat") return undefined
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

/** Run the Keel follower, and keep the report when it is accepted. */
export function keelShouldAccept(follower: JobFollower, frame: NamedEvent, push: (event: JobEvent) => void): boolean {
	const report = keelReport(frame)
	if (report === undefined) return false
	if (!follower.accept(report)) return false
	push(report)
	return true
}
