import { expect, test } from "vitest"
import {
	bucketAtTime,
	bucketEndTime,
	bucketStartTime,
	regionAt,
	regionsFromCuts
} from "./regions"
import type { TranscriptCut, TranscriptWord } from "./transcript"

/** Six words, one per second, so each start reads a whole second. */
function words(): TranscriptWord[] {
	const texts = ["amber", "wakes", "before", "dawn", "daily", "early"]
	return texts.map((text, index) => ({ start: index, end: index + 1, text }))
}

/** One cut over the given word indexes. */
function cut(start: number, end: number, id = "cut-1"): TranscriptCut {
	return { id, range: { start, end }, reason: "clarity" }
}

test("the mapping pins the first bucket, the last bucket, and a boundary", () => {
	/* Ten buckets over ten seconds, so bucket N runs N to N plus 1. */
	expect(bucketStartTime(0, 10, 10)).toBe(0)
	expect(bucketEndTime(0, 10, 10)).toBe(1)
	expect(bucketStartTime(9, 10, 10)).toBe(9)
	expect(bucketEndTime(9, 10, 10)).toBe(10)
	/* A boundary belongs to the bucket it opens. */
	expect(bucketAtTime(1, 10, 10)).toBe(1)
	expect(bucketAtTime(0.999, 10, 10)).toBe(0)
	/* Both edges clamp. */
	expect(bucketAtTime(0, 10, 10)).toBe(0)
	expect(bucketAtTime(-1, 10, 10)).toBe(0)
	expect(bucketAtTime(10, 10, 10)).toBe(9)
	expect(bucketAtTime(11, 10, 10)).toBe(9)
})

test("the mapping round trips at bucket edges on a known peak count", () => {
	/* Four buckets over eight seconds, so bucket N runs N times 2 to N plus 1
	 * times 2. */
	expect(bucketStartTime(0, 4, 8)).toBe(0)
	expect(bucketEndTime(0, 4, 8)).toBe(2)
	expect(bucketStartTime(1, 4, 8)).toBe(2)
	expect(bucketEndTime(1, 4, 8)).toBe(4)
	expect(bucketStartTime(3, 4, 8)).toBe(6)
	expect(bucketEndTime(3, 4, 8)).toBe(8)
	expect(bucketAtTime(2, 4, 8)).toBe(1)
	expect(bucketAtTime(1.999, 4, 8)).toBe(0)
	expect(bucketAtTime(8, 4, 8)).toBe(3)
})

test("a boundary bucket index rejects an unknown bucket", () => {
	expect(() => bucketStartTime(-1, 10, 10)).toThrow(RangeError)
	expect(() => bucketStartTime(10, 10, 10)).toThrow(RangeError)
	expect(() => bucketEndTime(-1, 10, 10)).toThrow(RangeError)
	expect(() => bucketEndTime(10, 10, 10)).toThrow(RangeError)
})

test("a cut renders a region over exactly the buckets its range spans", () => {
	/* Words 1 to 2 run 1 to 3, so the region covers buckets 1 and 2. */
	const regions = regionsFromCuts(words(), [cut(1, 2)], 10, 10)
	expect(regions).toHaveLength(1)
	expect(regions[0].id).toBe("words-1-to-2")
	expect(regions[0].range).toEqual({ start: 1, end: 2 })
	expect(regions[0].start).toBe(1)
	expect(regions[0].end).toBe(3)
	expect(regions[0].firstBucket).toBe(1)
	expect(regions[0].lastBucket).toBe(2)
})

test("a span ending on a boundary stops at the bucket before it", () => {
	/* Words 0 to 1 run 0 to 2, and the span end opens bucket 2. */
	const regions = regionsFromCuts(words(), [cut(0, 1)], 10, 10)
	expect(regions).toHaveLength(1)
	expect(regions[0].firstBucket).toBe(0)
	expect(regions[0].lastBucket).toBe(1)
})

test("regions derive from the merged cuts and order earliest first", () => {
	const cuts = [cut(3, 4, "cut-2"), cut(1, 1, "cut-1")]
	const regions = regionsFromCuts(words(), cuts, 10, 10)
	expect(regions.map((region) => region.id)).toEqual(["words-1-to-1", "words-3-to-4"])
	expect(regions[0].firstBucket).toBe(1)
	expect(regions[0].lastBucket).toBe(1)
	expect(regions[1].firstBucket).toBe(3)
	expect(regions[1].lastBucket).toBe(4)
	/* Overlapping cuts join before regions read them. */
	const joined = regionsFromCuts(words(), [cut(1, 2, "cut-1"), cut(2, 3, "cut-2")], 10, 10)
	expect(joined).toHaveLength(1)
	expect(joined[0].range).toEqual({ start: 1, end: 3 })
	expect(joined[0].firstBucket).toBe(1)
	expect(joined[0].lastBucket).toBe(3)
})

test("no regions render without words or without a positive length", () => {
	expect(regionsFromCuts(words(), [], 10, 10)).toEqual([])
	expect(regionsFromCuts(words(), [cut(1, 2)], 10, 0)).toEqual([])
})

test("a hit test reads the region holding a position", () => {
	const regions = regionsFromCuts(words(), [cut(1, 2)], 10, 10)
	expect(regionAt(regions, 0.5)).toBeNull()
	expect(regionAt(regions, 1)?.id).toBe("words-1-to-2")
	expect(regionAt(regions, 2)?.id).toBe("words-1-to-2")
	expect(regionAt(regions, 3)).toBeNull()
	expect(regionAt(regions, 5)).toBeNull()
})
