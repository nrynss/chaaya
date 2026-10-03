import { describe, expect, test } from "vitest"
import type { JobProgress } from "./progress"

describe("job progress", () => {
	test("a reading is a plain shape with no required event names", () => {
		const reading: JobProgress = { id: "job-1", stage: "working", current: 1, total: 4, status: "running" }
		expect(reading.stage).toBe("working")
		expect(reading.detail).toBeUndefined()
	})
})
