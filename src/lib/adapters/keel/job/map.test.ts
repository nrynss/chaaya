import { describe, expect, test } from "vitest"
import { keelFrameMap } from "./map"

const data =
	'{"job_id":"3f9a1c7e5b2d8046a1c3e5f7092b4d68","stage":"transcoding","current":4,"total":12,"detail":{"pass":"loudness"}}'

describe("keel frame map", () => {
	test("a named event is read from its fields, not from rebuilt frame text", () => {
		const action = keelFrameMap().progress({ id: 3, name: "progress", data })
		expect(action).toEqual({
			kind: "progress",
			reading: {
				id: "3f9a1c7e5b2d8046a1c3e5f7092b4d68",
				stage: "transcoding",
				current: 4,
				total: 12,
				detail: { pass: "loudness" },
				status: "running",
			},
		})
	})
})
