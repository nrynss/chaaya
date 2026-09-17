/**
 * Timed words, word ranges, and the mapping between the source timeline and
 * the edited one. A consumer reads words, cuts ranges out of them, and maps a
 * position either way. A later binding can play the edited timeline by
 * skipping every cut span this module reports.
 */
/** One timed word of a transcript. Start and end read in source seconds. */
export interface TranscriptWord {
    /** The source second the word starts at. */
    readonly start: number;
    /** The source second the word ends at. */
    readonly end: number;
    /** The spoken text. */
    readonly text: string;
    /** The speaker label, when the transcript carries one. */
    readonly speaker?: string;
}
/** A span of words by index. Both ends are inclusive. */
export interface WordRange {
    /** The first word the range covers. */
    readonly start: number;
    /** The last word the range covers. */
    readonly end: number;
}
/** A removed span of words and the reason it left. Every cut reverts. */
export interface TranscriptCut {
    /** The identity a revert names. */
    readonly id: string;
    /** The words the cut removes. */
    readonly range: WordRange;
    /** Why the words left. */
    readonly reason: string;
}
/** One removed span in source seconds, after overlapping cuts merge. */
export interface CutSpan {
    /** The source second the removed span starts at. */
    readonly start: number;
    /** The source second the removed span ends at. */
    readonly end: number;
}
/** Order the ends of a range and clamp them to the word list. A range with
 * no word in it returns null, so callers skip it instead of cutting air. */
export declare function normalizeRange(count: number, range: WordRange): WordRange | null;
/** Merge every cut range into disjoint word spans, earliest first.
 * Overlapping or touching ranges join into one, so shared words never count
 * twice. Ranges are clamped to the word list and empty ones drop out. */
export declare function mergeRanges(count: number, cuts: readonly TranscriptCut[]): WordRange[];
/** Read the merged cuts as spans in source seconds, earliest first. */
export declare function cutSpans(words: readonly TranscriptWord[], cuts: readonly TranscriptCut[]): CutSpan[];
/** Map a source second to the edited timeline. A cut collapses onto the
 * point where it started, so every position inside one lands on that point
 * and the words around it meet there. */
export declare function toEditedTime(words: readonly TranscriptWord[], cuts: readonly TranscriptCut[], source: number): number;
/** Map an edited second back to the source timeline. A position exactly on a
 * collapsed cut returns the cut start, which is the earlier word edge, so a
 * boundary word keeps its own edge rather than its neighbour start. */
export declare function toSourceTime(words: readonly TranscriptWord[], cuts: readonly TranscriptCut[], edited: number): number;
/** Read one word start on the edited timeline. */
export declare function editedStart(words: readonly TranscriptWord[], cuts: readonly TranscriptCut[], index: number): number;
/** Read one word end on the edited timeline. */
export declare function editedEnd(words: readonly TranscriptWord[], cuts: readonly TranscriptCut[], index: number): number;
/** The edited timeline length in seconds. Cuts only remove, so this never
 * runs past the last word end. */
export declare function editedLength(words: readonly TranscriptWord[], cuts: readonly TranscriptCut[]): number;
