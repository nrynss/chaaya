/** The transcript range editor. Timed words arrive at build time and cuts
 * arrive from the keyboard, so the editor keeps both and derives the edited
 * timeline from them. A later binding can play the edited timeline by
 * skipping every cut span this module reports.
 */

import {
	cutSpans,
	editedEnd,
	editedLength,
	editedStart,
	mergeRanges,
	normalizeRange,
	toEditedTime,
	toSourceTime,
	type CutSpan,
	type TranscriptCut,
	type TranscriptWord,
	type WordRange
} from "./transcript.js"

/** Why a revert names nothing known. */
export type RevertMiss = "unknown-cut"

/** The focused word of the editor. */
export type Anchor = number | null

/** One reactive editor over a fixed word list. Selection, extension, cut
 * and revert all run from named methods, which the view wires to keyboard
 * friendly controls. */
export class TranscriptEditor {
	/** The words the editor reads, in source order. */
	readonly words: readonly TranscriptWord[]
	/** The live cuts in the order they arrived. */
	cuts = $state<TranscriptCut[]>([])
	/** The focused word index, or null before anything is selected. */
	anchor = $state<Anchor>(null)
	/** One end of the selection while it extends, or null when idle. */
	focus = $state<Anchor>(null)
	/** The reason the next cut carries. */
	reason = $state("cut for clarity")

	#nextCut = 1

	constructor(words: readonly TranscriptWord[]) {
		this.words = words
	}

	/** The current selection as a word range, or null with nothing chosen. */
	get selection(): WordRange | null {
		const anchor = this.anchor
		if (anchor === null || this.words.length === 0) return null
		const end = this.focus ?? anchor
		return normalizeRange(this.words.length, { start: anchor, end })
	}

	/** The merged cut ranges, earliest first. */
	get merged(): WordRange[] {
		return mergeRanges(this.words.length, this.cuts)
	}

	/** The merged cuts in source seconds, earliest first. */
	get spans(): CutSpan[] {
		return cutSpans(this.words, this.cuts)
	}

	/** The edited timeline length in seconds. */
	get length(): number {
		return editedLength(this.words, this.cuts)
	}

	/** Focus one word. */
	select(index: number): void {
		if (this.words.length === 0) {
			this.anchor = null
			this.focus = null
			return
		}
		const clamped = Math.min(Math.max(index, 0), this.words.length - 1)
		this.anchor = clamped
		this.focus = clamped
	}

	/** Grow the selection toward a word while the anchor stays put. */
	extend(index: number): void {
		if (this.anchor === null) {
			this.select(index)
			return
		}
		if (this.words.length === 0) return
		this.focus = Math.min(Math.max(index, 0), this.words.length - 1)
	}

	/** Move the focused word by a step, keeping the selection where it is. */
	move(step: number): void {
		if (this.words.length === 0) return
		const base = this.focus ?? this.anchor ?? 0
		this.focus = Math.min(Math.max(base + step, 0), this.words.length - 1)
		if (this.anchor === null) this.anchor = this.focus
	}

	/** Cut the selection with a reason and clear the selection. */
	cut(reason?: string): TranscriptCut | null {
		const selection = this.selection
		if (!selection) return null
		const text = reason ?? this.reason
		const cut: TranscriptCut = {
			id: `cut-${this.#nextCut}`,
			range: selection,
			reason: text
		}
		this.#nextCut += 1
		this.cuts = [...this.cuts, cut]
		this.anchor = null
		this.focus = null
		return cut
	}

	/** Revert one cut by id. An unknown id leaves every cut untouched. */
	revert(id: string): TranscriptCut | RevertMiss {
		let found: TranscriptCut | null = null
		this.cuts = this.cuts.filter((cut) => {
			if (cut.id === id) {
				found = cut
				return false
			}
			return true
		})
		return found ?? "unknown-cut"
	}

	/** Revert every cut. */
	revertAll(): void {
		this.cuts = []
	}

	/** Map a source second to the edited timeline. */
	toEdited(source: number): number {
		return toEditedTime(this.words, this.cuts, source)
	}

	/** Map an edited second back to the source timeline. */
	toSource(edited: number): number {
		return toSourceTime(this.words, this.cuts, edited)
	}

	/** Read one word start on the edited timeline. */
	editedStart(index: number): number {
		return editedStart(this.words, this.cuts, index)
	}

	/** Read one word end on the edited timeline. */
	editedEnd(index: number): number {
		return editedEnd(this.words, this.cuts, index)
	}
}

export type {
	CutSpan,
	TranscriptCut,
	TranscriptWord,
	WordRange
}
