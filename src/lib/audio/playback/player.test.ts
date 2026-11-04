import { describe, expect, it, vi } from "vitest"
import { AudioPlayer } from "./player.js"

/** A media element with only what the player reads. Events fire by hand,
 * so each test controls exactly which element events arrive. */
class FakeElement extends EventTarget {
	currentTime = 0
	duration = Number.NaN
	playbackRate = 1
	paused = true
	muted = false
	src = ""
	networkState = 1
	error: { code: number; message: string } | null = null
	spans: [number, number][] = []
	get buffered(): { length: number; start(index: number): number; end(index: number): number } {
		const spans = this.spans
		return {
			length: spans.length,
			start: (index) => spans[index][0],
			end: (index) => spans[index][1]
		}
	}
	play(): Promise<void> {
		this.paused = false
		return Promise.resolve()
	}
	pause(): void {
		this.paused = true
	}
	load(): void {}
	setAttribute(): void {}
	fire(type: string): void {
		this.dispatchEvent(new Event(type))
	}
}

function build(options: { resolveSource?: () => string } = {}): {
	player: AudioPlayer
	element: FakeElement
	heard: () => number
} {
	const element = new FakeElement()
	const player = new AudioPlayer({
		element: element as unknown as HTMLMediaElement,
		...options
	})
	// Adopt the element and load a source before counting, so the counts
	// below cover only the step each test names.
	player.load("https://media.example/take.wav")
	const listener = vi.fn()
	player.subscribe(listener)
	return { player, element, heard: () => listener.mock.calls.length }
}

describe("AudioPlayer notifications", () => {
	it("notifies once on a seek", () => {
		const { player, element, heard } = build()
		player.seek(4)
		expect(heard()).toBe(1)
		expect(player.currentTime).toBe(4)
		// The seeked event that follows reads the same position.
		element.fire("seeked")
		expect(heard()).toBe(1)
	})

	it("notifies on play and pause events", () => {
		const { player, element, heard } = build()
		element.fire("play")
		expect(heard()).toBe(1)
		expect(player.playing).toBe(true)
		element.fire("pause")
		expect(heard()).toBe(2)
		expect(player.playing).toBe(false)
		element.fire("ended")
		expect(heard()).toBe(2)
	})

	it("notifies once per timeupdate that moves the clock, and not for one that does not", () => {
		const { player, element, heard } = build()
		element.currentTime = 1.25
		element.fire("timeupdate")
		expect(heard()).toBe(1)
		expect(player.currentTime).toBe(1.25)
		element.fire("timeupdate")
		expect(heard()).toBe(1)
		element.currentTime = 1.5
		element.fire("timeupdate")
		expect(heard()).toBe(2)
	})

	it("notifies once for a source recovery that swaps the source", async () => {
		let fresh = 0
		const { player, element, heard } = build({
			resolveSource: () => `https://media.example/take.wav?sig=${++fresh}`
		})
		element.error = { code: 2, message: "network" }
		element.fire("error")
		await vi.waitFor(() => expect(player.source).toBe("https://media.example/take.wav?sig=1"))
		expect(player.recoveries).toBe(1)
		expect(player.error).toBeNull()
		// The count, then the swap. The restored position equals the held
		// one, so it adds nothing.
		expect(heard()).toBe(2)
	})

	it("notifies nothing for events that change no published value", () => {
		const { element, heard } = build()
		element.fire("progress")
		element.fire("waiting")
		element.fire("volumechange")
		element.fire("canplay")
		element.fire("seeking")
		element.fire("ratechange")
		element.fire("durationchange")
		expect(heard()).toBe(0)
	})

	it("keeps the buffered list when a progress event buffered nothing new", () => {
		const { player, element, heard } = build()
		element.spans = [[0, 2]]
		element.fire("progress")
		expect(heard()).toBe(1)
		const first = player.buffered
		element.fire("progress")
		expect(heard()).toBe(1)
		expect(player.buffered).toBe(first)
		element.spans = [[0, 3]]
		element.fire("progress")
		expect(heard()).toBe(2)
		expect(player.buffered).not.toBe(first)
	})

	it("adds no timer of its own", () => {
		vi.useFakeTimers()
		try {
			const { heard } = build()
			vi.advanceTimersByTime(10_000)
			expect(vi.getTimerCount()).toBe(0)
			expect(heard()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it("publishes the rate the element reports, once", () => {
		const { player, element, heard } = build()
		element.playbackRate = 1.5
		element.fire("ratechange")
		expect(heard()).toBe(1)
		expect(player.rate).toBe(1.5)
	})

	it("notifies once for a load that resets several fields", () => {
		const { player, element, heard } = build()
		element.currentTime = 3
		element.fire("timeupdate")
		element.fire("play")
		expect(heard()).toBe(2)
		player.load("https://media.example/other.wav")
		expect(heard()).toBe(3)
		expect(player.playing).toBe(false)
		expect(player.currentTime).toBe(0)
	})
})
