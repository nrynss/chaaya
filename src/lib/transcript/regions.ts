/**
 * Waveform regions over the transcript model. A waveform draws peaks in fixed
 * buckets, and a cut should appear exactly where it happened. This module maps
 * buckets to seconds both ways and reads each merged cut as one region, so the
 * waveform never carries a second source of truth.
 */

import {
	cutSpans,
	mergeRanges,
	type TranscriptCut,
	type TranscriptWord,
	type WordRange
} from "./transcript.js"

/** One cut rendered over a waveform, in source seconds and in buckets. */
export interface WaveformRegion {
	/** The identity a consumer uses as a key. It names the word range. */
	readonly id: string
	/** The words the region removes. Both ends are inclusive. */
	readonly range: WordRange
	/** The source second the region starts at. */
	readonly start: number
	/** The source second the region ends at. */
	readonly end: number
	/** The first peak bucket the region covers. */
	readonly firstBucket: number
	/** The last peak bucket the region covers. */
	readonly lastBucket: number
}

/** How many buckets a waveform draws. A waveform always draws at least one. */
function bucketTotal(buckets: number): number {
	return Math.max(1, Math.floor(buckets))
}

/** Read the source second one bucket starts at. The first bucket starts at
 * zero and neighbours meet, so every bucket covers a half open span. */
export function bucketStartTime(bucket: number, buckets: number, duration: number): number {
	const count = bucketTotal(buckets)
	if (!Number.isInteger(bucket) || bucket < 0 || bucket >= count) {
		throw new RangeError(`bucket ${bucket} sits outside 0 to ${count - 1}`)
	}
	return (bucket * duration) / count
}

/** Read the source second one bucket ends at. The last bucket ends exactly on
 * the waveform length, so the mapping closes at both edges. */
export function bucketEndTime(bucket: number, buckets: number, duration: number): number {
	const count = bucketTotal(buckets)
	if (!Number.isInteger(bucket) || bucket < 0 || bucket >= count) {
		throw new RangeError(`bucket ${bucket} sits outside 0 to ${count - 1}`)
	}
	return ((bucket + 1) * duration) / count
}

/** Read the bucket holding a source second. A boundary belongs to the bucket
 * it opens, and both edges clamp, so zero reads the first bucket and the
 * waveform length reads the last one. */
export function bucketAtTime(position: number, buckets: number, duration: number): number {
	const count = bucketTotal(buckets)
	if (!(duration > 0)) return 0
	if (position <= 0) return 0
	if (position >= duration) return count - 1
	const bucket = Math.floor((position * count) / duration)
	return Math.min(Math.max(bucket, 0), count - 1)
}

/** Read every merged cut as one waveform region, earliest first. A region
 * covers exactly the buckets its span touches. A span ending exactly on a
 * boundary stops at the bucket before it, because that boundary opens the next
 * bucket. Without a positive length there is nothing to draw, so the call
 * reads no regions. */
export function regionsFromCuts(
	words: readonly TranscriptWord[],
	cuts: readonly TranscriptCut[],
	buckets: number,
	duration: number
): WaveformRegion[] {
	if (!(duration > 0)) return []
	const count = bucketTotal(buckets)
	const ranges = mergeRanges(words.length, cuts)
	const spans = cutSpans(words, cuts)
	const regions: WaveformRegion[] = []
	for (let index = 0; index < ranges.length; index += 1) {
		const range = ranges[index]
		const span = spans[index]
		const firstBucket = bucketAtTime(span.start, count, duration)
		let lastBucket = bucketAtTime(span.end, count, duration)
		if (lastBucket > firstBucket && bucketStartTime(lastBucket, count, duration) >= span.end) {
			lastBucket -= 1
		}
		regions.push({
			id: `words-${range.start}-to-${range.end}`,
			range,
			start: span.start,
			end: span.end,
			firstBucket,
			lastBucket
		})
	}
	return regions
}

/** Read the region holding a source second, or null in a gap. A start belongs
 * to its region and an end belongs to whatever holds it next, so neighbours
 * never share a position. */
export function regionAt(
	regions: readonly WaveformRegion[],
	position: number
): WaveformRegion | null {
	for (const region of regions) {
		if (position < region.start) break
		if (position < region.end) return region
	}
	return null
}
