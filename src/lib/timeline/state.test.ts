import { expect, test } from "vitest"
import { TimelineScale } from "./state.js"

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

test("construction starts at version zero and setters publish only changed values", () => {
	const scale = new TimelineScale(50, 4)
	const readings: { density: number; scroll: number; version: number }[] = []
	const unsubscribe = scale.subscribe(() => {
		readings.push({ density: scale.pixelsPerSecond, scroll: scale.scrollSeconds, version: scale.version })
	})
	expect(scale.version).toBe(0)
	scale.pixelsPerSecond = 50
	scale.scrollSeconds = 4
	expect(readings).toEqual([])
	scale.pixelsPerSecond = 100
	scale.scrollSeconds = 2
	expect(readings).toEqual([
		{ density: 100, scroll: 4, version: 1 },
		{ density: 100, scroll: 2, version: 2 }
	])
	unsubscribe()
	scale.scrollSeconds = 3
	expect(readings).toHaveLength(2)
})

test("zoom publishes the complete scale once and ignores an unchanged zoom", () => {
	const scale = new TimelineScale(100, 2)
	const readings: { pixelsPerSecond: number; scrollSeconds: number }[] = []
	scale.subscribe(() => readings.push(scale.scale))
	scale.zoom(2, 5)
	expect(readings).toEqual([{ pixelsPerSecond: 200, scrollSeconds: 3.5 }])
	expect(scale.version).toBe(1)
	scale.zoom(1, 5)
	expect(readings).toHaveLength(1)
	expect(scale.version).toBe(1)
	expect(() => scale.zoom(0, 5)).toThrow(RangeError)
	expect(readings).toHaveLength(1)
})
