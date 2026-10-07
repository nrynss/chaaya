import { expect, test } from "vitest"
import { moveSegment, resizeSegment } from "./edit"
import type { EditLimits } from "./edit"

const bounds = { start: 0, end: 10 }

/** Limits with bounds only, so every option reads its default. */
function bare(): EditLimits {
	return { bounds }
}

test("a move shifts the span and keeps its length", () => {
	const result = moveSegment({ start: 1, end: 3 }, 2, bare())
	expect(result).toEqual({ segment: { start: 3, end: 5 }, snappedTo: null })
})

test("a move rejects a bad span, bad bounds, or a bad delta", () => {
	expect(() => moveSegment({ start: 2, end: 2 }, 1, bare())).toThrow(RangeError)
	expect(() => moveSegment({ start: 3, end: 1 }, 1, bare())).toThrow(RangeError)
	expect(() => moveSegment({ start: Number.NaN, end: 3 }, 1, bare())).toThrow(RangeError)
	expect(() => moveSegment({ start: 1, end: 3 }, 1, { bounds: { start: 5, end: 5 } })).toThrow(
		RangeError
	)
	expect(() =>
		moveSegment({ start: 1, end: 3 }, 1, { bounds: { start: Number.NaN, end: 5 } })
	).toThrow(RangeError)
	expect(() => moveSegment({ start: 1, end: 3 }, Number.NaN, bare())).toThrow(RangeError)
	expect(() => moveSegment({ start: 1, end: 3 }, Number.POSITIVE_INFINITY, bare())).toThrow(
		RangeError
	)
})

test("a move clamps to bounds on both sides", () => {
	expect(moveSegment({ start: 1, end: 3 }, -5, bare()).segment).toEqual({ start: 0, end: 2 })
	expect(moveSegment({ start: 7, end: 9 }, 5, bare()).segment).toEqual({ start: 8, end: 10 })
})

test("a move stops at neighbours on both sides", () => {
	const neighbours = [
		{ start: 0, end: 1 },
		{ start: 8, end: 9 }
	]
	expect(moveSegment({ start: 2, end: 4 }, -5, { bounds, neighbours }).segment).toEqual({
		start: 1,
		end: 3
	})
	expect(moveSegment({ start: 2, end: 4 }, 5, { bounds, neighbours }).segment).toEqual({
		start: 6,
		end: 8
	})
})

test("a move ignores a neighbour that already overlaps", () => {
	const neighbours = [{ start: 2, end: 5 }]
	const result = moveSegment({ start: 3, end: 4 }, 1, { bounds, neighbours })
	expect(result.segment).toEqual({ start: 4, end: 5 })
})

test("a boxed move stays where it stands", () => {
	const neighbours = [
		{ start: 3, end: 4 },
		{ start: 5, end: 6 }
	]
	const result = moveSegment({ start: 4, end: 5 }, 1, { bounds, neighbours })
	expect(result.segment).toEqual({ start: 4, end: 5 })
})

test("a move snaps either edge and names the target", () => {
	/* The start lands on 4 with a rise of 0.2. */
	const byStart = moveSegment({ start: 1, end: 3 }, 2.8, {
		bounds,
		snapTargets: [4],
		snapThreshold: 0.5
	})
	expect(byStart).toEqual({ segment: { start: 4, end: 6 }, snappedTo: 4 })
	/* The end lands on 6 with a rise of 0.2. */
	const byEnd = moveSegment({ start: 1, end: 3 }, 2.8, {
		bounds,
		snapTargets: [6],
		snapThreshold: 0.5
	})
	expect(byEnd).toEqual({ segment: { start: 4, end: 6 }, snappedTo: 6 })
})

test("a move reports the nearer target and the first wins a tie", () => {
	const nearer = moveSegment({ start: 1, end: 3 }, 0.6, {
		bounds,
		snapTargets: [2.5, 2],
		snapThreshold: 1
	})
	expect(nearer.snappedTo).toBe(2)
	expect(nearer.segment).toEqual({ start: 2, end: 4 })
	const tied = moveSegment({ start: 0, end: 2 }, 0, {
		bounds,
		snapTargets: [1, 1],
		snapThreshold: 1
	})
	expect(tied.snappedTo).toBe(1)
})

test("a move skips a target past the threshold or off the list", () => {
	const far = moveSegment({ start: 1, end: 3 }, 0.2, {
		bounds,
		snapTargets: [4],
		snapThreshold: 0.5
	})
	expect(far.snappedTo).toBeNull()
	expect(far.segment).toEqual({ start: 1.2, end: 3.2 })
	const off = moveSegment({ start: 1, end: 3 }, 0.2, {
		bounds,
		snapTargets: [Number.NaN, 4],
		snapThreshold: 0.1
	})
	expect(off.snappedTo).toBeNull()
})

test("a move without a threshold never snaps", () => {
	expect(moveSegment({ start: 1, end: 3 }, 1, { bounds, snapTargets: [2] }).snappedTo).toBeNull()
	expect(
		moveSegment({ start: 1, end: 3 }, 1, { bounds, snapTargets: [2], snapThreshold: -1 })
			.snappedTo
	).toBeNull()
})

test("a clamp that pulls the span off its target clears the report", () => {
	const result = moveSegment({ start: 7, end: 9 }, 1, {
		bounds: { start: 0, end: 9 },
		snapTargets: [10],
		snapThreshold: 2
	})
	expect(result.segment).toEqual({ start: 7, end: 9 })
	expect(result.snappedTo).toBeNull()
})

test("a resize moves one edge and keeps the other", () => {
	expect(resizeSegment({ start: 2, end: 5 }, "start", -1, bare()).segment).toEqual({
		start: 1,
		end: 5
	})
	expect(resizeSegment({ start: 2, end: 5 }, "end", 2, bare()).segment).toEqual({
		start: 2,
		end: 7
	})
})

test("a resize rejects a bad edge", () => {
	expect(() => resizeSegment({ start: 2, end: 5 }, "middle" as never, 1, bare())).toThrow(
		RangeError
	)
})

test("a resize keeps the minimum length on both edges", () => {
	const limits: EditLimits = { bounds, minLength: 1 }
	expect(resizeSegment({ start: 2, end: 5 }, "start", 5, limits).segment).toEqual({
		start: 4,
		end: 5
	})
	expect(resizeSegment({ start: 2, end: 5 }, "end", -5, limits).segment).toEqual({
		start: 2,
		end: 3
	})
})

test("a resize reads a negative minimum as zero", () => {
	const limits: EditLimits = { bounds, minLength: -2 }
	expect(resizeSegment({ start: 2, end: 5 }, "start", 1, limits).segment).toEqual({
		start: 3,
		end: 5
	})
})

test("a resize clamps to bounds on both edges", () => {
	expect(resizeSegment({ start: 2, end: 5 }, "start", -5, bare()).segment).toEqual({
		start: 0,
		end: 5
	})
	expect(resizeSegment({ start: 2, end: 5 }, "end", 9, bare()).segment).toEqual({
		start: 2,
		end: 10
	})
})

test("a resize stops at neighbours on both edges", () => {
	const neighbours = [
		{ start: 0, end: 1 },
		{ start: 8, end: 9 }
	]
	expect(resizeSegment({ start: 2, end: 5 }, "start", -5, { bounds, neighbours }).segment).toEqual(
		{ start: 1, end: 5 }
	)
	expect(resizeSegment({ start: 2, end: 5 }, "end", 5, { bounds, neighbours }).segment).toEqual({
		start: 2,
		end: 8
	})
})

test("a resize snaps the moving edge and names the target", () => {
	const head = resizeSegment({ start: 1, end: 4 }, "start", 0.8, {
		bounds,
		snapTargets: [2],
		snapThreshold: 0.5
	})
	expect(head).toEqual({ segment: { start: 2, end: 4 }, snappedTo: 2 })
	const tail = resizeSegment({ start: 1, end: 4 }, "end", 0.8, {
		bounds,
		snapTargets: [5],
		snapThreshold: 0.5
	})
	expect(tail).toEqual({ segment: { start: 1, end: 5 }, snappedTo: 5 })
})

test("a resize clears the report when the clamp wins", () => {
	const head = resizeSegment({ start: 1, end: 4 }, "start", -0.8, {
		bounds: { start: 1, end: 10 },
		snapTargets: [0],
		snapThreshold: 2
	})
	expect(head.segment).toEqual({ start: 1, end: 4 })
	expect(head.snappedTo).toBeNull()
	const tail = resizeSegment({ start: 1, end: 4 }, "end", 0.8, {
		bounds: { start: 0, end: 4 },
		snapTargets: [6],
		snapThreshold: 3
	})
	expect(tail.segment).toEqual({ start: 1, end: 4 })
	expect(tail.snappedTo).toBeNull()
})
