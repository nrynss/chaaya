/**
 * How a Thutapi-style book or interview event becomes one Keel job.Progress
 * reading. The server publishes these frames, then ends the job with done or
 * error. JobStream already renders stage, current, and total, and the progress
 * event keeps detail. This module does not open a stream.
 *
 * A done or error frame cannot carry the domain payload. Put that payload on
 * the last progress detail, then let the runner emit the terminal frame.
 * See domain.md beside this file.
 */

/** The five book stages, in pipeline order. */
export const bookStages = ["structuring", "illustrating", "narrating", "binding", "filming"] as const

/** One book stage name. */
export type BookStage = (typeof bookStages)[number]

/** Whether a string is one of the five book stages. */
export function isBookStage(value: string): value is BookStage {
	return (bookStages as readonly string[]).includes(value)
}

/** The JSON a job.Progress frame carries. Detail is the app's own object. */
export interface ProgressPayload {
	stage: string
	current?: number
	total?: number
	detail?: Record<string, unknown>
}

/** The progress frames to publish, and the job status after them. */
export interface DomainReading {
	/** Frames to publish, in order. Empty when the event is only a terminal. */
	progress: ProgressPayload[]
	/** running while the job continues, done or error when it ends. */
	status: "running" | "done" | "error"
	/** The error code of a failed job. Absent unless status is error. */
	errorCode?: string
	/** A sentence a client may show. Absent unless status is error. */
	errorMessage?: string
}

function stageAt(stage: BookStage): { current: number; total: number } {
	return { current: bookStages.indexOf(stage) + 1, total: bookStages.length }
}

function payload(stage: string, current: number, total: number, detail: Record<string, unknown>): ProgressPayload {
	if (!Number.isInteger(current) || !Number.isInteger(total) || current < 0 || total < 1 || current > total) {
		throw new Error("progress counts must be whole numbers inside the total")
	}
	return { stage, current, total, detail }
}

function eventDetail(event: string, fields: Record<string, unknown>): Record<string, unknown> {
	const detail: Record<string, unknown> = { event }
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) detail[key] = value
	}
	return detail
}

/** The reading for entering one book stage. current/total count the five stages. */
export function bookStageReading(stage: BookStage): DomainReading {
	const at = stageAt(stage)
	return {
		status: "running",
		progress: [payload(stage, at.current, at.total, { event: "stage" })]
	}
}

/**
 * One approved illustration. current/total count pages, which is what the
 * page screen reads. detail.stage_current still names illustrating among the
 * five stages.
 */
export function pageApprovedReading(page: { n: number; imageUrl: string }, pageCount: number): DomainReading {
	const at = stageAt("illustrating")
	return {
		status: "running",
		progress: [
			payload(
				"illustrating",
				page.n,
				pageCount,
				eventDetail("page_approved", {
					n: page.n,
					image_url: page.imageUrl,
					stage_current: at.current,
					stage_total: at.total
				})
			)
		]
	}
}

/** Narration was skipped. The job keeps running; the film is captioned and silent. */
export function narrationUnavailableReading(): DomainReading {
	const at = stageAt("narrating")
	return {
		status: "running",
		progress: [payload("narrating", at.current, at.total, { event: "narration_unavailable" })]
	}
}

/** The book artifacts exist. Publish this frame, then finish the job as done. */
export function bookReadyReading(ready: { pdfUrl: string; videoUrl: string }): DomainReading {
	const at = stageAt("filming")
	return {
		status: "done",
		progress: [
			payload(
				"filming",
				at.current,
				at.total,
				eventDetail("book_ready", { pdf_url: ready.pdfUrl, video_url: ready.videoUrl })
			)
		]
	}
}

/** The book run failed. The error terminal uses the code failed. There is no progress frame, matching failed {}. */
export function bookFailedReading(message = "The book run failed."): DomainReading {
	return {
		status: "error",
		errorCode: "failed",
		errorMessage: message,
		progress: []
	}
}

/** One interview question. current/total count filled checklist slots. */
export function questionReading(
	question: {
		turn: number
		text: string
		chips?: readonly string[]
		filled?: readonly string[]
		exchanges?: number
	},
	checklistSize: number
): DomainReading {
	return {
		status: "running",
		progress: [
			payload(
				"question",
				question.filled?.length ?? 0,
				checklistSize,
				eventDetail("question", {
					turn: question.turn,
					text: question.text,
					chips: question.chips === undefined ? undefined : [...question.chips],
					filled: question.filled === undefined ? undefined : [...question.filled],
					exchanges: question.exchanges
				})
			)
		]
	}
}

/**
 * Spoken audio for the current question. Checklist counts are unchanged when
 * the caller passes them, and omitted when it does not.
 */
export function questionAudioReading(
	audio: { turn: number; audioUrl: string },
	checklist?: { filled: number; total: number }
): DomainReading {
	const frame: ProgressPayload = {
		stage: "question_audio",
		detail: eventDetail("question_audio", { turn: audio.turn, audio_url: audio.audioUrl })
	}
	if (checklist !== undefined) {
		const counted = payload("question_audio", checklist.filled, checklist.total, frame.detail ?? {})
		return { status: "running", progress: [counted] }
	}
	return { status: "running", progress: [frame] }
}

/** The interview ended. Publish this frame, then finish the job as done. */
export function interviewEndedReading(
	ended: { reason: string; text: string; filled?: readonly string[] },
	checklistSize?: number
): DomainReading {
	const detail = eventDetail("ended", {
		reason: ended.reason,
		text: ended.text,
		filled: ended.filled === undefined ? undefined : [...ended.filled]
	})
	if (checklistSize === undefined) {
		return { status: "done", progress: [{ stage: "ended", detail }] }
	}
	return {
		status: "done",
		progress: [payload("ended", ended.filled?.length ?? 0, checklistSize, detail)]
	}
}

/** The interview failed. The error terminal uses the code internal. */
export function interviewErrorReading(message = "The interview failed."): DomainReading {
	return {
		status: "error",
		errorCode: "internal",
		errorMessage: message,
		progress: []
	}
}
