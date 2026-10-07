import { expect, test } from "vitest"
import { TimelineScale } from "./state.svelte"

test("a scale holds density and scroll with defaults", () => {
	const scale = new TimelineScale()
	expect(scale.pixelsPerSecond).toBe(100)
	expect(scale.scrollSeconds).toBe(0)
	expect(scale.scale).toEqual({ pixelsPerSecond: 100, scrollSeconds: 0 })
})

test("a scale rejects a bad density at construction", () => {
	expect(() => new TimelineScale(0)).toThrow(RangeError)
	expect(() => new TimelineScale(-50)).toThrow(RangeError)
})

test("a scale converts both ways and reads the room", () => {
	const scale = new TimelineScale(50, 4)
	expect(scale.secondsToPixels(6)).toBe(100)
	expect(scale.pixelsToSeconds(100)).toBe(6)
	expect(scale.visible(100)).toEqual({ start: 4, end: 6 })
})

test("a scale zooms about the anchor and ticks the span", () => {
	const scale = new TimelineScale(100, 2)
	scale.zoom(2, 5)
	expect(scale.pixelsPerSecond).toBe(200)
	expect(scale.secondsToPixels(5)).toBe(300)
	expect(scale.ticks(0, 3, 160)).toEqual([0, 1, 2, 3])
})
