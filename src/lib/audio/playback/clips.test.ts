import { describe, expect, test } from "vitest"
import { placementAt, planPlacements, type TimedClip } from "./clips.js"

function clip(over: Partial<TimedClip> = {}): TimedClip {
	return {
		key: "line",
		url: "/clips/line.wav",
		offset: 4,
		inPoint: 1,
		length: 6,
		gain: 0.8,
		...over
	}
}

describe("placementAt", () => {
	test("a later clip waits for its offset and plays whole", () => {
		const placement = placementAt(clip(), 1, 100)
		expect(placement).toEqual({ key: "line", startAt: 103, bufferOffset: 1, playLength: 6, gain: 0.8 })
	})

	test("an overlapping clip starts now partway into its buffer", () => {
		const placement = placementAt(clip(), 6, 100)
		expect(placement).toEqual({ key: "line", startAt: 100, bufferOffset: 3, playLength: 4, gain: 0.8 })
	})

	test("a clip at its exact offset starts now at its in point", () => {
		const placement = placementAt(clip(), 4, 100)
		expect(placement).toEqual({ key: "line", startAt: 100, bufferOffset: 1, playLength: 6, gain: 0.8 })
	})

	test("a clip the playhead has passed never sounds", () => {
		expect(placementAt(clip(), 10, 100)).toBeNull()
		expect(placementAt(clip(), 11, 100)).toBeNull()
	})

	test("a faster rate pulls a later start closer to now", () => {
		const placement = placementAt(clip(), 1, 100, 2)
		expect(placement?.startAt).toBe(101.5)
	})
})

describe("planPlacements", () => {
	test("it keeps the clip order and drops the spent clip", () => {
		const clips = [
			clip({ key: "past", offset: 0, length: 1 }),
			clip({ key: "now", offset: 4, length: 6 }),
			clip({ key: "later", offset: 8, length: 2 })
		]
		const placements = planPlacements(clips, 5, 100)
		expect(placements.map((placement) => placement.key)).toEqual(["now", "later"])
		expect(placements[0]).toEqual({
			key: "now",
			startAt: 100,
			bufferOffset: 2,
			playLength: 5,
			gain: 0.8
		})
		expect(placements[1]).toEqual({
			key: "later",
			startAt: 103,
			bufferOffset: 1,
			playLength: 2,
			gain: 0.8
		})
	})

	test("no clip with sound left plans nothing", () => {
		expect(planPlacements([clip({ offset: 0, length: 1 })], 9, 100)).toEqual([])
	})
})
