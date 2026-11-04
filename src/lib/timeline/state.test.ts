import { expect, test } from "vitest"
import { TimelineScale } from "./state"

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

test("a zoom notifies once, and density and scroll land together", () => {
	const scale = new TimelineScale(100, 2)
	const seen: Array<[number, number]> = []
	scale.subscribe(() => seen.push([scale.pixelsPerSecond, scale.scrollSeconds]))
	scale.zoom(2, 5)
	expect(seen).toEqual([[200, 3.5]])
	expect(scale.version).toBe(1)
})

test("a write notifies once, and a write of the held value does not", () => {
	const scale = new TimelineScale(100, 0)
	let heard = 0
	scale.subscribe(() => {
		heard += 1
	})
	scale.pixelsPerSecond = 40
	scale.scrollSeconds = 3
	expect(heard).toBe(2)
	expect(scale.scale).toEqual({ pixelsPerSecond: 40, scrollSeconds: 3 })
	scale.pixelsPerSecond = 40
	scale.zoom(1, 5)
	expect(heard).toBe(2)
	expect(scale.version).toBe(2)
})

test("construction notifies nothing", () => {
	const scale = new TimelineScale(50, 4)
	expect(scale.version).toBe(0)
})

test("a refused zoom throws and notifies nothing", () => {
	const scale = new TimelineScale(100, 2)
	const listener: Array<number> = []
	scale.subscribe(() => listener.push(scale.version))
	expect(() => scale.zoom(0, 5)).toThrow(RangeError)
	expect(() => scale.zoom(2, Number.NaN)).toThrow(RangeError)
	expect(listener).toEqual([])
	expect(scale.scale).toEqual({ pixelsPerSecond: 100, scrollSeconds: 2 })
})

test("an unsubscribed listener hears no later write", () => {
	const scale = new TimelineScale()
	let heard = 0
	const unsubscribe = scale.subscribe(() => {
		heard += 1
	})
	scale.scrollSeconds = 1
	unsubscribe()
	scale.scrollSeconds = 2
	expect(heard).toBe(1)
})
