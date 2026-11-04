/** The transcript range editor. Timed words arrive at build time and cuts
 * arrive from the keyboard, so the editor keeps both and derives the edited
 * timeline from them. A later binding can play the edited timeline by
 * skipping every cut span this module reports.
 */

import { Notifier } from "../core/observable.js"
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

/** The state an editor publishes. One write may set several fields, and a
 * view hears it once. */
interface EditorFields {
	cuts: readonly TranscriptCut[]
	anchor: Anchor
	focus: Anchor
	reason: string
}

/** One editor over a fixed word list. Selection, extension, cut and revert
 * all run from named methods, which the view wires to keyboard friendly
 * controls. The editor is an observable: each method notifies once when it
 * changed something, and `cuts` is replaced on change. */
export class TranscriptEditor extends Notifier {
	#fields: EditorFields = {
		cuts: [],
		anchor: null,
		focus: null,
		reason: "cut for clarity"
	}

	/** The live cuts in the order they arrived. Replaced on change. */
	get cuts(): readonly TranscriptCut[] {
		return this.#fields.cuts
	}

	/** The focused word index, or null before anything is selected. */
	get anchor(): Anchor {
		return this.#fields.anchor
	}

	/** One end of the selection while it extends, or null when idle. */
	get focus(): Anchor {
		return this.#fields.focus
	}

	/** The reason the next cut carries. */
	get reason(): string {
		return this.#fields.reason
	}
	set reason(value: string) {
		this.#write({ reason: value })
	}

	/** Apply one change to the published state and notify once when a value
	 * moved. Equal values notify nothing, the way a rune skipped them. */
	#write(patch: Partial<EditorFields>): void {
		let changed = false
		const next = { ...this.#fields }
		for (const key of Object.keys(patch) as (keyof EditorFields)[]) {
			if (Object.is(next[key], patch[key])) continue
			;(next as Record<keyof EditorFields, unknown>)[key] = patch[key]
			changed = true
		}
		if (!changed) return
		this.#fields = next
		this.notify()
	}

	/** The words the editor reads, in source order. */
	readonly words: readonly TranscriptWord[]

	#nextCut = 1

	constructor(words: readonly TranscriptWord[]) {
		super()
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
			this.#write({ anchor: null, focus: null })
			return
		}
		const clamped = Math.min(Math.max(index, 0), this.words.length - 1)
		this.#write({ anchor: clamped, focus: clamped })
	}

	/** Grow the selection toward a word while the anchor stays put. */
	extend(index: number): void {
		if (this.anchor === null) {
			this.select(index)
			return
		}
		if (this.words.length === 0) return
		this.#write({ focus: Math.min(Math.max(index, 0), this.words.length - 1) })
	}

	/** Move the focused word by a step, keeping the selection where it is. */
	move(step: number): void {
		if (this.words.length === 0) return
		const base = this.focus ?? this.anchor ?? 0
		const focus = Math.min(Math.max(base + step, 0), this.words.length - 1)
		this.#write(this.anchor === null ? { focus, anchor: focus } : { focus })
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
		this.#write({ cuts: [...this.cuts, cut], anchor: null, focus: null })
		return cut
	}

	/** Revert one cut by id. An unknown id leaves every cut untouched. */
	revert(id: string): TranscriptCut | RevertMiss {
		const found = this.cuts.find((cut) => cut.id === id)
		if (found === undefined) return "unknown-cut"
		this.#write({ cuts: this.cuts.filter((cut) => cut !== found) })
		return found
	}

	/** Revert every cut. */
	revertAll(): void {
		if (this.cuts.length === 0) return
		this.#write({ cuts: [] })
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
