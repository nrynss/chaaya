import { describe, expect, it, vi } from "vitest"
import { LiveLevel } from "./levels/live-level.js"
import { ClipScheduler } from "./playback/scheduler.js"

/** An analyser that hands back whatever block a test sets. */
function fakeAnalyser(block: () => number[]): AnalyserNode {
	return {
		fftSize: 4,
		getFloatTimeDomainData: (buffer: Float32Array) => buffer.set(block())
	} as unknown as AnalyserNode
}

describe("LiveLevel", () => {
	it("notifies once per sample, even when the level holds", () => {
		let block = [0.5, -0.5, 0.5, -0.5]
		const meter = new LiveLevel(fakeAnalyser(() => block))
		const heard = vi.fn()
		meter.subscribe(heard)
		meter.read()
		expect(heard).toHaveBeenCalledTimes(1)
		const rms = meter.rmsDb
		meter.read()
		expect(heard).toHaveBeenCalledTimes(2)
		expect(meter.rmsDb).toBe(rms)
		block = [0.1, -0.1, 0.1, -0.1]
		meter.read()
		expect(heard).toHaveBeenCalledTimes(3)
		expect(meter.rmsDb).toBeLessThan(rms)
	})

	it("samples once per animation frame while watched", () => {
		const frames: FrameRequestCallback[] = []
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			frames.push(callback)
			return frames.length
		})
		vi.stubGlobal("cancelAnimationFrame", () => undefined)
		try {
			const meter = new LiveLevel(fakeAnalyser(() => [0.2, 0.2, 0.2, 0.2]))
			const heard = vi.fn()
			meter.subscribe(heard)
			const stop = meter.watch()
			expect(heard).not.toHaveBeenCalled()
			frames.shift()?.(0)
			frames.shift()?.(16)
			expect(heard).toHaveBeenCalledTimes(2)
			stop()
			expect(meter.running).toBe(false)
		} finally {
			vi.unstubAllGlobals()
		}
	})
})

describe("ClipScheduler", () => {
	function build(): { scheduler: ClipScheduler; element: EventTarget } {
		const element = Object.assign(new EventTarget(), { currentTime: 0, playbackRate: 1 })
		const context = { currentTime: 0, destination: {} } as unknown as AudioContext
		const scheduler = new ClipScheduler({
			context,
			element: element as unknown as HTMLMediaElement
		})
		return { scheduler, element }
	}

	it("notifies once per setClips and replaces the list", () => {
		const { scheduler } = build()
		const heard = vi.fn()
		scheduler.subscribe(heard)
		const before = scheduler.clips
		scheduler.setClips([{ key: "a", url: "https://media.example/a.wav", offset: 0, inPoint: 0, length: 1, gain: 1 }])
		expect(heard).toHaveBeenCalledTimes(1)
		expect(scheduler.clips).not.toBe(before)
		expect(scheduler.clips).toHaveLength(1)
	})

	it("notifies once per skipped clip", async () => {
		vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }))
		try {
			const { scheduler } = build()
			scheduler.setClips([
				{ key: "a", url: "https://media.example/a.wav", offset: 0, inPoint: 0, length: 1, gain: 1 },
				{ key: "b", url: "https://media.example/b.wav", offset: 1, inPoint: 0, length: 1, gain: 1 }
			])
			const heard = vi.fn()
			scheduler.subscribe(heard)
			await scheduler.prepare()
			expect(scheduler.skipped).toEqual(["a", "b"])
			expect(heard).toHaveBeenCalledTimes(2)
		} finally {
			vi.unstubAllGlobals()
		}
	})

	it("attach returns a teardown that detaches, and a second attach returns the same one", () => {
		const { scheduler, element } = build()
		const add = vi.spyOn(element, "addEventListener")
		const remove = vi.spyOn(element, "removeEventListener")
		const teardown = scheduler.attach()
		expect(scheduler.attach()).toBe(teardown)
		expect(add).toHaveBeenCalledTimes(6)
		teardown()
		expect(remove).toHaveBeenCalledTimes(6)
		teardown()
		expect(remove).toHaveBeenCalledTimes(6)
	})
})
