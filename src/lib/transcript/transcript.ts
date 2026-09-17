/**
 * Timed words, word ranges, and the mapping between the source timeline and
 * the edited one. A consumer reads words, cuts ranges out of them, and maps a
 * position either way. A later binding can play the edited timeline by
 * skipping every cut span this module reports.
 */

/** One timed word of a transcript. Start and end read in source seconds. */
export interface TranscriptWord {
	/** The source second the word starts at. */
	readonly start: number
	/** The source second the word ends at. */
	readonly end: number
	/** The spoken text. */
	readonly text: string
	/** The speaker label, when the transcript carries one. */
	readonly speaker?: string
}

/** A span of words by index. Both ends are inclusive. */
export interface WordRange {
	/** The first word the range covers. */
	readonly start: number
	/** The last word the range covers. */
	readonly end: number
}

/** A removed span of words and the reason it left. Every cut reverts. */
export interface TranscriptCut {
	/** The identity a revert names. */
	readonly id: string
	/** The words the cut removes. */
	readonly range: WordRange
	/** Why the words left. */
	readonly reason: string
}

/** One removed span in source seconds, after overlapping cuts merge. */
export interface CutSpan {
	/** The source second the removed span starts at. */
	readonly start: number
	/** The source second the removed span ends at. */
	readonly end: number
}

/** The length of one span in seconds. */
function spanLength(span: CutSpan): number {
	return span.end - span.start
}

/** Order the ends of a range and clamp them to the word list. A range with
 * no word in it returns null, so callers skip it instead of cutting air. */
export function normalizeRange(count: number, range: WordRange): WordRange | null {
	if (count <= 0) return null
	const low = Math.max(0, Math.min(range.start, range.end))
	const high = Math.min(count - 1, Math.max(range.start, range.end))
	if (low > high) return null
	return { start: low, end: high }
}

/** Merge every cut range into disjoint word spans, earliest first.
 * Overlapping or touching ranges join into one, so shared words never count
 * twice. Ranges are clamped to the word list and empty ones drop out. */
export function mergeRanges(count: number, cuts: readonly TranscriptCut[]): WordRange[] {
	const ranges: WordRange[] = []
	for (const cut of cuts) {
		const range = normalizeRange(count, cut.range)
		if (range) ranges.push(range)
	}
	ranges.sort((left, right) => left.start - right.start || left.end - right.end)
	const merged: { start: number; end: number }[] = []
	for (const range of ranges) {
		const last = merged[merged.length - 1]
		if (last && range.start <= last.end + 1) {
			if (range.end > last.end) last.end = range.end
		} else {
			merged.push({ start: range.start, end: range.end })
		}
	}
	return merged
}

/** Read the merged cuts as spans in source seconds, earliest first. */
export function cutSpans(
	words: readonly TranscriptWord[],
	cuts: readonly TranscriptCut[]
): CutSpan[] {
	const spans: CutSpan[] = []
	for (const range of mergeRanges(words.length, cuts)) {
		spans.push({ start: words[range.start].start, end: words[range.end].end })
	}
	return spans
}

/** How many removed seconds end at or before a source position. The spans
 * arrive sorted, so the walk stops at the first span still open there. */
function removedBefore(spans: readonly CutSpan[], position: number): number {
	let removed = 0
	for (const span of spans) {
		if (span.end > position) break
		removed += spanLength(span)
	}
	return removed
}

/** Map a source second to the edited timeline. A cut collapses onto the
 * point where it started, so every position inside one lands on that point
 * and the words around it meet there. */
export function toEditedTime(
	words: readonly TranscriptWord[],
	cuts: readonly TranscriptCut[],
	source: number
): number {
	const spans = cutSpans(words, cuts)
	for (const span of spans) {
		if (source < span.start) break
		if (source < span.end) return span.start - removedBefore(spans, span.start)
	}
	return source - removedBefore(spans, source)
}

/** Map an edited second back to the source timeline. A position exactly on a
 * collapsed cut returns the cut start, which is the earlier word edge, so a
 * boundary word keeps its own edge rather than its neighbour start. */
export function toSourceTime(
	words: readonly TranscriptWord[],
	cuts: readonly TranscriptCut[],
	edited: number
): number {
	const spans = cutSpans(words, cuts)
	let shift = 0
	for (const span of spans) {
		const collapsed = span.start - shift
		if (edited < collapsed) return edited + shift
		if (edited === collapsed) return span.start
		shift += spanLength(span)
	}
	return edited + shift
}

/** Find the merged range holding a word index, or nothing past every cut. */
function rangeHolding(
	ranges: readonly WordRange[],
	index: number
): WordRange | undefined {
	for (const range of ranges) {
		if (index < range.start) return undefined
		if (index <= range.end) return range
	}
	return undefined
}

/** Read one word edge on the edited timeline. A cut word sits exactly on the
 * collapsed point of its span. Any other word keeps its own edge minus the
 * cuts before it, so neighbours of a cut meet without crossing it. */
function editedEdge(
	words: readonly TranscriptWord[],
	cuts: readonly TranscriptCut[],
	index: number,
	edge: "start" | "end"
): number {
	const count = words.length
	if (index < 0 || index >= count) {
		throw new RangeError(`word ${index} sits outside 0 to ${count - 1}`)
	}
	const spans = cutSpans(words, cuts)
	const holding = rangeHolding(mergeRanges(count, cuts), index)
	if (holding) {
		const cutStart = words[holding.start].start
		return cutStart - removedBefore(spans, cutStart)
	}
	const position = edge === "start" ? words[index].start : words[index].end
	return position - removedBefore(spans, position)
}

/** Read one word start on the edited timeline. */
export function editedStart(
	words: readonly TranscriptWord[],
	cuts: readonly TranscriptCut[],
	index: number
): number {
	return editedEdge(words, cuts, index, "start")
}

/** Read one word end on the edited timeline. */
export function editedEnd(
	words: readonly TranscriptWord[],
	cuts: readonly TranscriptCut[],
	index: number
): number {
	return editedEdge(words, cuts, index, "end")
}

/** The edited timeline length in seconds. Cuts only remove, so this never
 * runs past the last word end. */
export function editedLength(
	words: readonly TranscriptWord[],
	cuts: readonly TranscriptCut[]
): number {
	if (words.length === 0) return 0
	let removed = 0
	for (const span of cutSpans(words, cuts)) removed += spanLength(span)
	return words[words.length - 1].end - removed
}

/** The word sounding at a source position, or null in a gap, in a cut, or
 * past the last word. A start belongs to its word and an end belongs to
 * whatever holds it next, so neighbours never share a position. */
export function activeWordAt(
	words: readonly TranscriptWord[],
	cuts: readonly TranscriptCut[],
	position: number
): number | null {
	for (const span of cutSpans(words, cuts)) {
		if (position < span.start) break
		if (position < span.end) return null
	}
	for (let index = 0; index < words.length; index += 1) {
		const word = words[index]
		if (position >= word.start && position < word.end) return index
	}
	return null
}

/** Where playback resumes when a source position sits inside a cut, or null
 * when it plays. The resume point is the span end, so the whole cut stays
 * silent and the words around it meet. */
export function skipCutAt(
	words: readonly TranscriptWord[],
	cuts: readonly TranscriptCut[],
	position: number
): number | null {
	for (const span of cutSpans(words, cuts)) {
		if (position < span.start) break
		if (position < span.end) return span.end
	}
	return null
}
