// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import { FrameLoop } from "./loop.svelte.js"

function eventFrame(name: string, id: number): string {
	return [`event: ${name}`, `id: ${id}`, `data: {}`, "", ""].join("\n")
}

function streamOf(frames: string[], close: boolean): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder()
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const item of frames) controller.enqueue(encoder.encode(item))
			if (close) controller.close()
		},
	})
}

/** A stream that stays open and sends nothing, so the loop holds it. */
function openStream(): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({})
}

function setVisibility(state: "hidden" | "visible"): void {
	Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
	document.dispatchEvent(new Event("visibilitychange"))
}

function setOnline(online: boolean): void {
	Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online })
	window.dispatchEvent(new Event(online ? "online" : "offline"))
}

afterEach(() => {
	Reflect.deleteProperty(document, "visibilityState")
	Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true })
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("frame loop pause", () => {
	test("hidden for 60 seconds then visible ends live, not failed", async () => {
		vi.useFakeTimers()
		const fetchMock = vi.fn(async () => new Response(streamOf([eventFrame("alpha", 4)], true)))
		vi.stubGlobal("fetch", fetchMock)
		const loop = new FrameLoop({
			url: "http://pause.test/events",
			reconnect: { baseMs: 500, maxMs: 8000, attempts: 6 },
			onFrame: () => ({ keep: true }),
		})
		loop.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		expect(loop.connection).toBe("reconnecting")
		setVisibility("hidden")
		expect(loop.connection).toBe("paused")
		expect(vi.getTimerCount()).toBe(0)
		await vi.advanceTimersByTimeAsync(60_000)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(loop.connection).toBe("paused")
		fetchMock.mockResolvedValue(new Response(openStream()))
		setVisibility("visible")
		await vi.advanceTimersByTimeAsync(0)
		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(loop.connection).toBe("live")
		loop.close()
		expect(loop.connection).toBe("closed")
	})

	test("a resume resends Last-Event-ID from the last kept frame", async () => {
		vi.useFakeTimers()
		const fetchMock = vi.fn(async () => new Response(streamOf([eventFrame("alpha", 4)], true)))
		vi.stubGlobal("fetch", fetchMock)
		const loop = new FrameLoop({
			url: "http://pause.test/events",
			reconnect: { baseMs: 500, maxMs: 8000, attempts: 6 },
			onFrame: () => ({ keep: true }),
		})
		loop.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		setVisibility("hidden")
		fetchMock.mockResolvedValue(new Response(openStream()))
		setVisibility("visible")
		await vi.advanceTimersByTimeAsync(0)
		expect(new Headers(vi.mocked(fetch).mock.calls[1]?.[1]?.headers).get("last-event-id")).toBe("4")
		loop.close()
	})

	test("offline pauses and online reconnects at once", async () => {
		vi.useFakeTimers()
		const fetchMock = vi.fn(async () => new Response(openStream()))
		vi.stubGlobal("fetch", fetchMock)
		const loop = new FrameLoop({
			url: "http://pause.test/events",
			reconnect: { baseMs: 500, maxMs: 8000, attempts: 6 },
			onFrame: () => ({ keep: true }),
		})
		loop.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		expect(loop.connection).toBe("live")
		setOnline(false)
		expect(loop.connection).toBe("paused")
		await vi.advanceTimersByTimeAsync(30_000)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		setOnline(true)
		await vi.advanceTimersByTimeAsync(0)
		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(loop.connection).toBe("live")
		loop.close()
	})

	test("attaching while hidden waits without a request", async () => {
		vi.useFakeTimers()
		setVisibility("hidden")
		const fetchMock = vi.fn(async () => new Response(openStream()))
		vi.stubGlobal("fetch", fetchMock)
		const loop = new FrameLoop({ url: "http://pause.test/events", onFrame: () => ({ keep: true }) })
		loop.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(1000)
		expect(fetchMock).not.toHaveBeenCalled()
		expect(loop.connection).toBe("paused")
		setVisibility("visible")
		await vi.advanceTimersByTimeAsync(0)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(loop.connection).toBe("live")
		loop.close()
	})

	test("pauseWhenHidden false keeps retrying while hidden", async () => {
		vi.useFakeTimers()
		let calls = 0
		const fetchMock = vi.fn(async () => {
			calls += 1
			if (calls === 1) return new Response(streamOf([eventFrame("alpha", 1)], true))
			throw new Error("down")
		})
		vi.stubGlobal("fetch", fetchMock)
		const loop = new FrameLoop({
			url: "http://pause.test/events",
			reconnect: { baseMs: 500, maxMs: 8000, attempts: 6 },
			pauseWhenHidden: false,
			onFrame: () => ({ keep: true }),
		})
		loop.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		expect(loop.connection).toBe("reconnecting")
		setVisibility("hidden")
		await vi.advanceTimersByTimeAsync(1000)
		expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
		expect(loop.connection).toBe("reconnecting")
		await vi.advanceTimersByTimeAsync(30_000)
		expect(loop.connection).toBe("failed")
		loop.close()
	})

	test("close removes the listeners, so a later hide changes nothing", async () => {
		vi.useFakeTimers()
		const fetchMock = vi.fn(async () => new Response(openStream()))
		vi.stubGlobal("fetch", fetchMock)
		const loop = new FrameLoop({ url: "http://pause.test/events", onFrame: () => ({ keep: true }) })
		loop.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		expect(loop.connection).toBe("live")
		loop.close()
		setVisibility("hidden")
		await vi.advanceTimersByTimeAsync(1000)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(loop.connection).toBe("closed")
	})
})
