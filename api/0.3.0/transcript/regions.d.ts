/**
 * Waveform regions over the transcript model. A waveform draws peaks in fixed
 * buckets, and a cut should appear exactly where it happened. This module maps
 * buckets to seconds both ways and reads each merged cut as one region, so the
 * waveform never carries a second source of truth.
 */
import { type TranscriptCut, type TranscriptWord, type WordRange } from "./transcript.js";
/** One cut rendered over a waveform, in source seconds and in buckets. */
export interface WaveformRegion {
    /** The identity a consumer uses as a key. It names the word range. */
    readonly id: string;
    /** The words the region removes. Both ends are inclusive. */
    readonly range: WordRange;
    /** The source second the region starts at. */
    readonly start: number;
    /** The source second the region ends at. */
    readonly end: number;
    /** The first peak bucket the region covers. */
    readonly firstBucket: number;
    /** The last peak bucket the region covers. */
    readonly lastBucket: number;
}
/** Read the source second one bucket starts at. The first bucket starts at
 * zero and neighbours meet, so every bucket covers a half open span. */
export declare function bucketStartTime(bucket: number, buckets: number, duration: number): number;
/** Read the source second one bucket ends at. The last bucket ends exactly on
 * the waveform length, so the mapping closes at both edges. */
export declare function bucketEndTime(bucket: number, buckets: number, duration: number): number;
/** Read the bucket holding a source second. A boundary belongs to the bucket
 * it opens, and both edges clamp, so zero reads the first bucket and the
 * waveform length reads the last one. */
export declare function bucketAtTime(position: number, buckets: number, duration: number): number;
/** Read every merged cut as one waveform region, earliest first. A region
 * covers exactly the buckets its span touches. A span ending exactly on a
 * boundary stops at the bucket before it, because that boundary opens the next
 * bucket. Without a positive length there is nothing to draw, so the call
 * reads no regions. */
export declare function regionsFromCuts(words: readonly TranscriptWord[], cuts: readonly TranscriptCut[], buckets: number, duration: number): WaveformRegion[];
/** Read the region holding a source second, or null in a gap. A start belongs
 * to its region and an end belongs to whatever holds it next, so neighbours
 * never share a position. */
export declare function regionAt(regions: readonly WaveformRegion[], position: number): WaveformRegion | null;
