import { describe, expect, test } from "vitest"
import { toJobProgress } from "./progress"

describe("keel progress mapping", () => {
	test("a snapshot becomes a generic progress reading", () => {
		expect(
			toJobProgress({
				jobId: "job-1",
				status: "running",
				stage: "transcoding",
				current: 4,
				total: 12,
			}),
		).toEqual({ id: "job-1", status: "running", stage: "transcoding", current: 4, total: 12 })
	})

	test("a snapshot error is not stored in detail", () => {
		expect(
			toJobProgress({
				jobId: "job-1",
				status: "error",
				error: { code: "upstream_failed", message: "The media service failed." },
			}),
		).toEqual({ id: "job-1", status: "error" })
	})
})
