import { describe, expect, it, vi } from "vitest"
import { TranscriptEditor } from "./editor.js"
import { TranscriptFollower, type TranscriptClock } from "./follow.js"

const words = [
	{ start: 0, end: 1, text: "one" },
	{ start: 1, end: 2, text: "two" },
	{ start: 2, end: 3, text: "three" },
	{ start: 3, end: 4, text: "four" }
]

/** A clock a test moves by hand. Each move tells its subscribers, the way
 * a media element fires timeupdate. */
function fakeClock(): TranscriptClock & { moveTo(seconds: number): void; listeners: number } {
	const listeners = new Set<() => void>()
	let position = 0
	return {
		get currentTime(): number {
			return position
		},
		seek(seconds: number): void {
			position = seconds
			for (const listener of [...listeners]) listener()
		},
		moveTo(seconds: number): void {
			position = seconds
			for (const listener of [...listeners]) listener()
		},
		subscribe(listener: () => void): () => void {
			const entry = (): void => listener()
			listeners.add(entry)
			return () => listeners.delete(entry)
		},
		get listeners(): number {
			return listeners.size
		}
	}
}

describe("TranscriptFollower without a framework", () => {
	it("skips a cut on a clock move and notifies each activeWord change once", () => {
		const editor = new TranscriptEditor(words)
		editor.select(1)
		editor.cut("gone")
		const clock = fakeClock()
		const follower = new TranscriptFollower(editor, clock)
		const seen: (number | null)[] = []
		follower.subscribe(() => seen.push(follower.activeWord))
		const stop = follower.attach()
		expect(seen).toEqual([])
		clock.moveTo(0.5)
		expect(seen).toEqual([])
		// Entering the cut word seeks past it, to word two.
		clock.moveTo(1.2)
		expect(clock.currentTime).toBe(2)
		expect(seen).toEqual([2])
		clock.moveTo(2.5)
		expect(seen).toEqual([2])
		clock.moveTo(3.5)
		expect(seen).toEqual([2, 3])
		stop()
		expect(clock.listeners).toBe(0)
		clock.moveTo(0.5)
		expect(seen).toEqual([2, 3])
	})

	it("notifies when an editor change moves the active word", () => {
		const editor = new TranscriptEditor(words)
		const clock = fakeClock()
		const follower = new TranscriptFollower(editor, clock)
		const heard = vi.fn()
		follower.subscribe(heard)
		const stop = follower.attach()
		clock.moveTo(1.5)
		expect(follower.activeWord).toBe(1)
		expect(heard).toHaveBeenCalledTimes(1)
		// Cutting the word under a resting playhead skips it at once.
		editor.select(1)
		editor.cut("gone")
		expect(clock.currentTime).toBe(2)
		expect(follower.activeWord).toBe(2)
		expect(heard).toHaveBeenCalledTimes(2)
		// A selection change that leaves activeWord alone stays quiet.
		editor.select(3)
		expect(heard).toHaveBeenCalledTimes(2)
		stop()
	})

	it("skips a cut the playhead already sits in when it attaches", () => {
		const editor = new TranscriptEditor(words)
		editor.select(0)
		editor.cut("gone")
		const clock = fakeClock()
		const follower = new TranscriptFollower(editor, clock)
		const stop = follower.attach()
		expect(clock.currentTime).toBe(1)
		stop()
		stop()
	})
})

describe("TranscriptEditor notifications", () => {
	it("notifies once per change and nothing for a no-op", () => {
		const editor = new TranscriptEditor(words)
		const heard = vi.fn()
		editor.subscribe(heard)
		editor.select(1)
		expect(heard).toHaveBeenCalledTimes(1)
		editor.select(1)
		expect(heard).toHaveBeenCalledTimes(1)
		editor.extend(2)
		editor.cut()
		expect(heard).toHaveBeenCalledTimes(3)
		expect(editor.revert("cut-9")).toBe("unknown-cut")
		expect(heard).toHaveBeenCalledTimes(3)
		const before = editor.cuts
		editor.revert("cut-1")
		expect(heard).toHaveBeenCalledTimes(4)
		expect(editor.cuts).not.toBe(before)
		editor.reason = "pace"
		expect(heard).toHaveBeenCalledTimes(5)
		editor.move(1)
		expect(heard).toHaveBeenCalledTimes(6)
		editor.revertAll()
		expect(heard).toHaveBeenCalledTimes(6)
		editor.select(0)
		editor.cut()
		editor.revertAll()
		expect(heard).toHaveBeenCalledTimes(9)
		expect(editor.cuts).toEqual([])
	})
})
