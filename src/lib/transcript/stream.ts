import type { TranscriptWord } from "./transcript.js"

/**
 * Timed words arriving on a generic event stream, turned into the array
 * `TranscriptEditor` takes. The bridge names no backend event and does not
 * import Keel. It also does not import the editor, so the editor stays a
 * fixed word list.
 */

/** One timed word a stream may carry. `index` revises a word already kept.
 * An index equal to the current length appends. Times are source seconds. */
export interface TimedWordInput {
	readonly start: number
	readonly end: number
	readonly text: string
	readonly speaker?: string
	readonly index?: number
}

/** The slice of an SSE frame this bridge reads. A comment is ignored.
 * `createEventStream` hands `onFrame` a `{ name, data }` value, which is enough. */
export interface TranscriptFrame {
	readonly kind?: "event" | "comment"
	readonly name?: string
	readonly data?: string
}

/** How one frame changed the word list. `ignore` and `invalid` leave the
 * list as it was. */
export type TranscriptApply =
	| { readonly type: "append"; readonly index: number; readonly word: TranscriptWord }
	| { readonly type: "revise"; readonly index: number; readonly word: TranscriptWord }
	| { readonly type: "snapshot"; readonly words: readonly TranscriptWord[] }
	| { readonly type: "done" }
	| { readonly type: "ignore" }
	| { readonly type: "invalid"; readonly reason: string }

/** What `createTranscriptBridge` needs. Omit `events` to read every named
 * event. `doneEvent` ends the list even when it is absent from `events`. */
export interface TranscriptBridgeOptions {
	/** Event names that carry words. Omit to accept every named event. */
	readonly events?: readonly string[]
	/** The event name that ends the stream. Omit and no event ends it.
	 * The payload is not read. */
	readonly doneEvent?: string
	/** Accept a JSON array, or an object `{ words: [...] }`, as a full
	 * replacement. Default true. */
	readonly snapshots?: boolean
	/** Read a payload yourself. Return null to ignore the frame. A thrown
	 * error becomes `invalid` and leaves the list alone. */
	readonly parse?: (
		data: string,
		name: string
	) => TimedWordInput | readonly TimedWordInput[] | null
}

/** A growing transcript. `words` is the editor input once the caller is
 * ready to construct one. `ordered` sorts a copy by source time. */
export interface TranscriptBridge {
	readonly words: readonly TranscriptWord[]
	readonly done: boolean
	apply(frame: TranscriptFrame): TranscriptApply
	/** A copy sorted by start, then end, then arrival. The stored list stays
	 * in arrival order. */
	ordered(): readonly TranscriptWord[]
	reset(): void
}

interface ParsedWord {
	readonly word: TranscriptWord
	readonly index: number | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function looksLikeWord(value: Record<string, unknown>): boolean {
	return (
		"start" in value ||
		"end" in value ||
		"text" in value ||
		"speaker" in value ||
		"index" in value
	)
}

/** Read one object as a word, or say it is not one. `"invalid"` means it
 * tried to be a word and failed a field. `null` means it is some other payload. */
function readWord(value: unknown): ParsedWord | "invalid" | null {
	if (!isRecord(value) || !looksLikeWord(value)) return null
	const start = value.start
	const end = value.end
	const text = value.text
	const speaker = value.speaker
	const index = value.index
	if (typeof start !== "number" || !Number.isFinite(start)) return "invalid"
	if (typeof end !== "number" || !Number.isFinite(end)) return "invalid"
	if (end < start) return "invalid"
	if (typeof text !== "string") return "invalid"
	if (speaker !== undefined && typeof speaker !== "string") return "invalid"
	if (index !== undefined && (!Number.isInteger(index) || (index as number) < 0)) return "invalid"
	const word: TranscriptWord = speaker === undefined ? { start, end, text } : { start, end, text, speaker }
	return { word, index: index as number | undefined }
}

function readMany(value: readonly unknown[]): ParsedWord[] | "invalid" {
	const parsed: ParsedWord[] = []
	for (const item of value) {
		const word = readWord(item)
		if (word === "invalid" || word === null) return "invalid"
		parsed.push(word)
	}
	return parsed
}

/**
 * Fold timed-word frames into `TranscriptWord`s.
 *
 * A frame is a comment, a done event, one word, or a snapshot. Anything else
 * is ignored, including a payload that is not a word. A payload that is a
 * word but fails a field is `invalid`, and the list does not change.
 *
 * After the done event, later frames are ignored until `reset`. The bridge
 * does not close the socket. `createEventStream` does that with `terminal`,
 * and that name has to sit in the stream's own `events` list or the stream
 * drops the frame before this bridge sees it. This bridge's `doneEvent` is
 * not dropped by its own `events` filter.
 *
 * `TranscriptEditor` keeps the word list it was constructed with, and cuts
 * are indexes into that list. Build the editor when the stream is done, or
 * when a snapshot will not shift earlier indexes. Appending at the end does
 * not move earlier indexes. A snapshot can. This bridge does not edit the
 * editor.
 */
export function createTranscriptBridge(options: TranscriptBridgeOptions = {}): TranscriptBridge {
	const snapshots = options.snapshots ?? true
	const names = options.events ? [...options.events] : null
	let words: TranscriptWord[] = []
	let done = false

	function ignore(): TranscriptApply {
		return { type: "ignore" }
	}

	function invalid(reason: string): TranscriptApply {
		return { type: "invalid", reason }
	}

	function applyOne(parsed: ParsedWord): TranscriptApply {
		if (parsed.index === undefined) {
			const index = words.length
			words = [...words, parsed.word]
			return { type: "append", index, word: parsed.word }
		}
		if (parsed.index > words.length) return invalid("index")
		if (parsed.index === words.length) {
			words = [...words, parsed.word]
			return { type: "append", index: parsed.index, word: parsed.word }
		}
		const next = words.slice()
		next[parsed.index] = parsed.word
		words = next
		return { type: "revise", index: parsed.index, word: parsed.word }
	}

	function applySnapshot(list: readonly ParsedWord[]): TranscriptApply {
		words = list.map((item) => item.word)
		return { type: "snapshot", words }
	}

	function fromParsed(value: TimedWordInput | readonly TimedWordInput[]): TranscriptApply {
		if (Array.isArray(value)) {
			if (!snapshots) return ignore()
			const many = readMany(value)
			if (many === "invalid") return invalid("word")
			return applySnapshot(many)
		}
		const one = readWord(value)
		if (one === null) return ignore()
		if (one === "invalid") return invalid("word")
		return applyOne(one)
	}

	function fromJson(data: string): TranscriptApply {
		let value: unknown
		try {
			value = JSON.parse(data)
		} catch {
			return invalid("json")
		}
		if (Array.isArray(value)) {
			if (!snapshots) return ignore()
			const many = readMany(value)
			if (many === "invalid") return invalid("word")
			return applySnapshot(many)
		}
		if (isRecord(value) && Array.isArray(value.words)) {
			if (!snapshots) return ignore()
			if (looksLikeWord(value)) return invalid("both")
			const many = readMany(value.words)
			if (many === "invalid") return invalid("word")
			return applySnapshot(many)
		}
		const one = readWord(value)
		if (one === null) return ignore()
		if (one === "invalid") return invalid("word")
		return applyOne(one)
	}

	function apply(frame: TranscriptFrame): TranscriptApply {
		if (done) return ignore()
		if (frame.kind === "comment") return ignore()
		const name = frame.name ?? ""
		if (options.doneEvent !== undefined && name === options.doneEvent) {
			done = true
			return { type: "done" }
		}
		if (names && !names.includes(name)) return ignore()
		const data = frame.data ?? ""
		if (data === "") return ignore()
		if (options.parse) {
			try {
				const parsed = options.parse(data, name)
				if (parsed === null) return ignore()
				return fromParsed(parsed)
			} catch {
				return invalid("parse")
			}
		}
		return fromJson(data)
	}

	function ordered(): readonly TranscriptWord[] {
		return words
			.map((word, index) => ({ word, index }))
			.sort(
				(left, right) =>
					left.word.start - right.word.start ||
					left.word.end - right.word.end ||
					left.index - right.index
			)
			.map((item) => item.word)
	}

	function reset(): void {
		words = []
		done = false
	}

	return {
		get words() {
			return words
		},
		get done() {
			return done
		},
		apply,
		ordered,
		reset
	}
}
