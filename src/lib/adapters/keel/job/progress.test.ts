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
})
