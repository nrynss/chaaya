import { Notifier } from "../core/observable.js"
import type { TranscriptEditor } from "./editor.js"
import { activeWordAt, skipCutAt } from "./transcript.js"

/** The least a clock needs to follow a transcript. A player meets it, and a
 * fake meets it in a logic check. */
export interface TranscriptClock {
	/** The position the clock reports, in source seconds. */
	currentTime: number
	/** Move the position to a source second. */
	seek(seconds: number): void
	/** Hear each position change, and get back a function that stops
	 * listening. An `AudioPlayer` and a `mediaClock` both provide it. */
	subscribe(listener: () => void): () => void
}

/** The element events that move a media clock. */
const CLOCK_EVENTS = ["timeupdate", "seeking", "seeked"] as const

/** Read a caller owned media element as a transcript clock. The binding
 * reads the element clock on every access and never starts a wall clock
 * timer. Its subscribe listens to the element's `timeupdate`, `seeking` and
 * `seeked` events. A player driving the same element meets the contract
 * too, and its published position stays reactive while the element plays. */
export function mediaClock(element: HTMLMediaElement): TranscriptClock {
	return {
		get currentTime(): number {
			return element.currentTime
		},
		seek(seconds: number): void {
			element.currentTime = seconds
		},
		subscribe(listener: () => void): () => void {
			// Each subscription gets its own handler, so one listener
			// subscribed twice is two subscriptions, as on a Notifier.
			const handler = (): void => listener()
			for (const type of CLOCK_EVENTS) element.addEventListener(type, handler)
			let live = true
			return () => {
				if (!live) return
				live = false
				for (const type of CLOCK_EVENTS) element.removeEventListener(type, handler)
			}
		}
	}
}

/** Bind one editor to one clock. The word under the playhead is derived
 * state a consumer renders however it likes. A word click seeks playback to
 * that word start, and the follower skips every cut span rather than playing
 * it. Construction touches nothing, so importing this module on a server is
 * safe.
 *
 * The follower is an observable. While attached it hears the clock and the
 * editor, skips each cut the playhead enters, and notifies once each time
 * `activeWord` changes. */
export class TranscriptFollower extends Notifier {
	/** The editor carrying the words and the cuts. */
	readonly editor: TranscriptEditor
	/** The clock carrying playback. */
	readonly clock: TranscriptClock

	/** The active word the last notification published. */
	#published: number | null = null

	constructor(editor: TranscriptEditor, clock: TranscriptClock) {
		super()
		this.editor = editor
		this.clock = clock
	}

	/** The word sounding at the playhead, or null in a gap, in a cut, or
	 * past the last word. */
	get activeWord(): number | null {
		return activeWordAt(this.editor.words, this.editor.cuts, this.clock.currentTime)
	}

	/** Seek playback to one word start. */
	seekToWord(index: number): void {
		const words = this.editor.words
		if (index < 0 || index >= words.length) {
			throw new RangeError(`word ${index} sits outside 0 to ${words.length - 1}`)
		}
		this.clock.seek(words[index].start)
	}

	/** Skip the playhead out of a cut once, and report where it resumed. A
	 * position outside every cut plays on and reports null. */
	update(): number | null {
		const resume = skipCutAt(this.editor.words, this.editor.cuts, this.clock.currentTime)
		if (resume !== null) this.clock.seek(resume)
		return resume
	}

	/** Follow the edited timeline, and get back the teardown. Each clock
	 * move and each editor change runs `update`, so a position inside a cut
	 * seeks to the span end and the cut stays silent. A clock move or an editor change
	 * notifies once when `activeWord` changed. A Svelte component calls
	 * `attach(follower)` from `@nrynss/chaaya/svelte`. */
	attach(): () => void {
		const onClock = (): void => {
			this.update()
			this.#publish()
		}
		const stopClock = this.clock.subscribe(onClock)
		// An editor change runs update too, so a cut made under a resting
		// playhead skips it at once, as the rune effect did.
		const stopEditor = this.editor.subscribe(onClock)
		this.#published = this.activeWord
		this.update()
		this.#publish()
		let live = true
		return () => {
			if (!live) return
			live = false
			stopClock()
			stopEditor()
		}
	}

	/** Notify once when the active word moved since the last notification. */
	#publish(): void {
		const active = this.activeWord
		if (active === this.#published) return
		this.#published = active
		this.notify()
	}
}
