import type { TranscriptEditor } from "./editor.svelte.js"
import { activeWordAt, skipCutAt } from "./transcript.js"

/** The least a clock needs to follow a transcript. A player meets it, and a
 * fake meets it in a logic check. */
export interface TranscriptClock {
	/** The position the clock reports, in source seconds. */
	currentTime: number
	/** Move the position to a source second. */
	seek(seconds: number): void
}

/** Run one cleanup task in the calling component's effect context. */
function runInEffect(task: () => () => void): void {
	$effect(() => task())
}

/** Bind one editor to one clock. The word under the playhead is derived
 * state a consumer renders however it likes. A word click seeks playback to
 * that word start, and the follower skips every cut span rather than playing
 * it. Construction touches nothing, so importing this module on a server is
 * safe. */
export class TranscriptFollower {
	/** The editor carrying the words and the cuts. */
	readonly editor: TranscriptEditor
	/** The clock carrying playback. */
	readonly clock: TranscriptClock

	constructor(editor: TranscriptEditor, clock: TranscriptClock) {
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

	/** Follow the edited timeline while the caller lives. Call it once during
	 * component initialisation. The read runs inside the caller effect, so it
	 * tracks the clock and reruns on every move. A passing position inside a
	 * cut seeks to the span end, so the cut stays silent. A test passes its
	 * own cleanup runner, because only a component owns the effect context
	 * the default runner needs. */
	follow(registerCleanup: (task: () => () => void) => void = runInEffect): void {
		registerCleanup(() => {
			this.update()
			return () => {}
		})
	}
}
