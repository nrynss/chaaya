import { expect, test } from "vitest"
import {
	chooseTicks,
	createScale,
	pixelsToSeconds,
	secondsToPixels,
	visibleRange,
	zoomScale
} from "./scale"

test("a scale builds with a default scroll of zero", () => {
	expect(createScale(100)).toEqual({ pixelsPerSecond: 100, scrollSeconds: 0 })
	expect(createScale(50, 4)).toEqual({ pixelsPerSecond: 50, scrollSeconds: 4 })
})

test("a scale rejects a bad density or a bad scroll", () => {
	expect(() => createScale(0)).toThrow(RangeError)
	expect(() => createScale(-100)).toThrow(RangeError)
	expect(() => createScale(Number.NaN)).toThrow(RangeError)
	expect(() => createScale(Number.POSITIVE_INFINITY)).toThrow(RangeError)
	expect(() => createScale(100, Number.NaN)).toThrow(RangeError)
	expect(() => createScale(100, Number.POSITIVE_INFINITY)).toThrow(RangeError)
})

test("seconds and pixels round trip with and without scroll", () => {
	expect(secondsToPixels(2, createScale(100))).toBe(200)
	expect(pixelsToSeconds(200, createScale(100))).toBe(2)
	const scrolled = createScale(50, 4)
	expect(secondsToPixels(6, scrolled)).toBe(100)
	expect(pixelsToSeconds(100, scrolled)).toBe(6)
	expect(pixelsToSeconds(secondsToPixels(3.25, scrolled), scrolled)).toBe(3.25)
})

test("the visible range spans the viewport from the scroll", () => {
	expect(visibleRange(createScale(100, 2), 300)).toEqual({ start: 2, end: 5 })
})

test("a hidden viewport reads an empty range at the scroll", () => {
	expect(visibleRange(createScale(100, 2), 0)).toEqual({ start: 2, end: 2 })
	expect(visibleRange(createScale(100, 2), -40)).toEqual({ start: 2, end: 2 })
})

test("zoom about an anchor keeps the anchor on its pixel", () => {
	const scale = createScale(100, 2)
	const zoomed = zoomScale(scale, 2, 5)
	expect(zoomed.pixelsPerSecond).toBe(200)
	/* The anchor reads the same pixel before and after the zoom. */
	expect(secondsToPixels(5, zoomed)).toBe(secondsToPixels(5, scale))
	expect(zoomed.scrollSeconds).toBe(3.5)
})

test("zoom out and unity zoom behave", () => {
	const scale = createScale(100, 2)
	expect(zoomScale(scale, 0.5, 5)).toEqual({ pixelsPerSecond: 50, scrollSeconds: -1 })
	expect(zoomScale(scale, 1, 5)).toEqual({ pixelsPerSecond: 100, scrollSeconds: 2 })
})

test("zoom rejects a bad factor or a bad anchor", () => {
	const scale = createScale(100, 2)
	expect(() => zoomScale(scale, 0, 5)).toThrow(RangeError)
	expect(() => zoomScale(scale, -2, 5)).toThrow(RangeError)
	expect(() => zoomScale(scale, Number.NaN, 5)).toThrow(RangeError)
	expect(() => zoomScale(scale, 2, Number.NaN)).toThrow(RangeError)
	expect(() => zoomScale(scale, 2, Number.POSITIVE_INFINITY)).toThrow(RangeError)
})

test("ticks pick the smallest round step that reaches the spacing", () => {
	/* A raw step of 0.8 seconds takes a one second step. */
	expect(chooseTicks(0, 3, 80, 100)).toEqual([0, 1, 2, 3])
	/* A raw step of 1.5 seconds takes a two second step. */
	expect(chooseTicks(0, 5, 150, 100)).toEqual([0, 2, 4])
	/* A raw step of 4 seconds takes a five second step. */
	expect(chooseTicks(0, 12, 400, 100)).toEqual([0, 5, 10])
	/* A raw step of 6 seconds takes a ten second step. */
	expect(chooseTicks(0, 25, 600, 100)).toEqual([0, 10, 20])
})

test("ticks align to multiples of the step inside the span", () => {
	expect(chooseTicks(0.3, 2.2, 80, 100)).toEqual([1, 2])
	expect(chooseTicks(-1, 1, 80, 100)).toEqual([-1, 0, 1])
})

test("ticks collapse a negative zero onto zero", () => {
	const ticks = chooseTicks(-0.5, 0.5, 80, 100)
	expect(ticks).toHaveLength(1)
	expect(Object.is(ticks[0], 0)).toBe(true)
})

test("ticks read empty past the last step", () => {
	expect(chooseTicks(0.6, 0.7, 80, 100)).toEqual([])
})

test("ticks read empty for an empty or inverted span", () => {
	expect(chooseTicks(2, 2, 80, 100)).toEqual([])
	expect(chooseTicks(3, 2, 80, 100)).toEqual([])
})

test("ticks reject a bad spacing or a bad density", () => {
	expect(() => chooseTicks(0, 3, 0, 100)).toThrow(RangeError)
	expect(() => chooseTicks(0, 3, -80, 100)).toThrow(RangeError)
	expect(() => chooseTicks(0, 3, Number.POSITIVE_INFINITY, 100)).toThrow(RangeError)
	expect(() => chooseTicks(0, 3, 80, 0)).toThrow(RangeError)
	expect(() => chooseTicks(0, 3, 80, -100)).toThrow(RangeError)
	expect(() => chooseTicks(0, 3, 80, Number.NaN)).toThrow(RangeError)
	expect(() => chooseTicks(0, 3, 80, Number.POSITIVE_INFINITY)).toThrow(RangeError)
})
