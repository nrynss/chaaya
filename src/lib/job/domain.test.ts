import { describe, expect, test } from "vitest"
import {
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
} from "./domain"

describe("book events as job progress", () => {
	test("the five stages count themselves in order", () => {
		expect(bookStages).toEqual(["structuring", "illustrating", "narrating", "binding", "filming"])
		expect(isBookStage("narrating")).toBe(true)
		expect(isBookStage("question")).toBe(false)
		expect(bookStageReading("narrating")).toEqual({
			status: "running",
			progress: [{ stage: "narrating", current: 3, total: 5, detail: { event: "stage" } }]
		})
	})

	test("an approved page counts pages and keeps the illustrating stage index", () => {
		expect(pageApprovedReading({ n: 3, imageUrl: "/media/page-3" }, 8)).toEqual({
			status: "running",
			progress: [
				{
					stage: "illustrating",
					current: 3,
					total: 8,
					detail: {
						event: "page_approved",
						n: 3,
						image_url: "/media/page-3",
						stage_current: 2,
						stage_total: 5
					}
				}
			]
		})
	})

	test("a missing narration stays on narrating and the job continues", () => {
		expect(narrationUnavailableReading()).toEqual({
			status: "running",
			progress: [{ stage: "narrating", current: 3, total: 5, detail: { event: "narration_unavailable" } }]
		})
	})

	test("book_ready is the last progress frame and then done", () => {
		expect(bookReadyReading({ pdfUrl: "/media/pdf", videoUrl: "/media/film" })).toEqual({
			status: "done",
			progress: [
				{
					stage: "filming",
					current: 5,
					total: 5,
					detail: { event: "book_ready", pdf_url: "/media/pdf", video_url: "/media/film" }
				}
			]
		})
	})

	test("failed is an error terminal with no progress frame", () => {
		expect(bookFailedReading()).toEqual({
			status: "error",
			errorCode: "failed",
			errorMessage: "The book run failed.",
			progress: []
		})
	})

	test("a page past the book is refused", () => {
		expect(() => pageApprovedReading({ n: 9, imageUrl: "/media/x" }, 8)).toThrow(/whole numbers/)
	})
})

describe("interview events as job progress", () => {
	test("a question counts filled checklist slots and keeps the wire fields", () => {
		expect(
			questionReading(
				{ turn: 3, text: "Who helps?", chips: ["a fox"], filled: ["hero", "companion"], exchanges: 2 },
				6
			)
		).toEqual({
			status: "running",
			progress: [
				{
					stage: "question",
					current: 2,
					total: 6,
					detail: {
						event: "question",
						turn: 3,
						text: "Who helps?",
						chips: ["a fox"],
						filled: ["hero", "companion"],
						exchanges: 2
					}
				}
			]
		})
	})

	test("question audio names the clip and can repeat the checklist position", () => {
		expect(questionAudioReading({ turn: 3, audioUrl: "/media/q" })).toEqual({
			status: "running",
			progress: [
				{ stage: "question_audio", detail: { event: "question_audio", turn: 3, audio_url: "/media/q" } }
			]
		})
		expect(questionAudioReading({ turn: 3, audioUrl: "/media/q" }, { filled: 2, total: 6 }).progress[0]).toMatchObject({
			current: 2,
			total: 6
		})
	})

	test("ended finishes the job and error uses the code internal", () => {
		expect(interviewEndedReading({ reason: "checklist", text: "bye", filled: ["hero"] }, 6)).toMatchObject({
			status: "done",
			progress: [{ stage: "ended", current: 1, total: 6 }]
		})
		expect(interviewErrorReading()).toEqual({
			status: "error",
			errorCode: "internal",
			errorMessage: "The interview failed.",
			progress: []
		})
	})
})
