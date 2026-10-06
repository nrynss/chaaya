// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import type { JobProgress } from "../progress"
import { createJobPoller, JobPoller } from "./index"
import type { JobPollerOptions } from "./index"

function setVisibility(state: "hidden" | "visible"): void {
	Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
	document.dispatchEvent(new Event("visibilitychange"))
}

function options<T>(extra: Partial<JobPollerOptions<T>> & Pick<JobPollerOptions<T>, "fetchState" | "toProgress" | "isTerminal">): JobPollerOptions<T> {
	return { intervalMs: 1000, maxIntervalMs: 8000, errorBudget: 3, ...extra }
}

function terminal(reading: JobProgress): boolean {
	return reading.status === "done" || reading.status === "error"
}

afterEach(() => {
	Reflect.deleteProperty(document, "visibilityState")
	Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true })
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("job poller", () => {
	test("createJobPoller returns a JobPoller that reads to a terminal", async () => {
		vi.useFakeTimers()
		const answers = [{ status: "running", current: 1 }, { status: "done", current: 2 }]
		const fetchState = vi.fn(async () => answers.shift())
		const poller = createJobPoller(
			options({
				fetchState,
				toProgress: (response) => ({ ...(response as JobProgress) }),
				isTerminal: terminal,
			}),
		)
		expect(poller).toBeInstanceOf(JobPoller)
		poller.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		expect(poller.progress).toEqual({ status: "running", current: 1 })
		expect(poller.connection).toBe("live")
		await vi.advanceTimersByTimeAsync(1000)
		expect(poller.progress).toEqual({ status: "done", current: 2 })
		expect(poller.connection).toBe("closed")
		expect(fetchState).toHaveBeenCalledTimes(2)
	})

	test("the interval backs off while unchanged and resets on change", async () => {
		vi.useFakeTimers()
		const answers = [
			{ status: "running", current: 1 },
			{ status: "running", current: 1 },
			{ status: "running", current: 1 },
			{ status: "running", current: 2 },
			{ status: "running", current: 2 },
		]
		const fetchState = vi.fn(async () => ({ ...(answers.shift() ?? { status: "running", current: 2 }) }))
		const poller = new JobPoller(
			options({
				fetchState,
				toProgress: (response) => response,
				isTerminal: terminal,
				maxIntervalMs: 3000,
			}),
		)
		poller.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		expect(fetchState).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1000)
		expect(fetchState).toHaveBeenCalledTimes(2)
		await vi.advanceTimersByTimeAsync(1999)
		expect(fetchState).toHaveBeenCalledTimes(2)
		await vi.advanceTimersByTimeAsync(1)
		expect(fetchState).toHaveBeenCalledTimes(3)
		await vi.advanceTimersByTimeAsync(2999)
		expect(fetchState).toHaveBeenCalledTimes(3)
		await vi.advanceTimersByTimeAsync(1)
		expect(fetchState).toHaveBeenCalledTimes(4)
		expect(poller.progress.current).toBe(2)
		await vi.advanceTimersByTimeAsync(1000)
		expect(fetchState).toHaveBeenCalledTimes(5)
		poller.close()
	})

	test("two failures then a success still complete, three in a row fail", async () => {
		vi.useFakeTimers()
		let calls = 0
		const fetchState = vi.fn(async () => {
			calls += 1
			if (calls <= 2 || calls >= 4) throw new Error("blip")
			return { status: "running", current: 1 }
		})
		const poller = new JobPoller(
			options({
				fetchState,
				toProgress: (response) => response,
				isTerminal: terminal,
				errorBudget: 2,
			}),
		)
		poller.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		expect(poller.connection).toBe("connecting")
		await vi.advanceTimersByTimeAsync(1000)
		expect(poller.connection).toBe("connecting")
		await vi.advanceTimersByTimeAsync(1000)
		expect(poller.progress.current).toBe(1)
		expect(poller.connection).toBe("live")
		await vi.advanceTimersByTimeAsync(3000)
		expect(poller.connection).toBe("failed")
		expect(poller.error?.code).toBe("poll_failed")
		expect(fetchState).toHaveBeenCalledTimes(6)
	})

	test("an unreadable answer counts toward the budget", async () => {
		vi.useFakeTimers()
		const fetchState = vi.fn(async () => ({ status: "running" }))
		const poller = new JobPoller(
			options({
				fetchState,
				toProgress: () => {
					throw new Error("unreadable")
				},
				isTerminal: terminal,
				errorBudget: 1,
			}),
		)
		poller.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(1000)
		expect(poller.connection).toBe("failed")
		expect(poller.error?.code).toBe("poll_failed")
	})

	test("the watch fails past its timeout", async () => {
		vi.useFakeTimers()
		const fetchState = vi.fn(async () => ({ status: "running", current: 1 }))
		const poller = new JobPoller(
			options({
				fetchState,
				toProgress: (response) => response,
				isTerminal: terminal,
				timeoutMs: 2500,
			}),
		)
		poller.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(2000)
		expect(fetchState).toHaveBeenCalledTimes(2)
		expect(poller.connection).toBe("live")
		await vi.advanceTimersByTimeAsync(1000)
		expect(poller.connection).toBe("failed")
		expect(poller.error?.code).toBe("poll_timeout")
	})

	test("hidden time pauses the polls and the timeout, visible reads at once", async () => {
		vi.useFakeTimers()
		const fetchState = vi.fn(async () => ({ status: "running", current: 1 }))
		const poller = new JobPoller(
			options({
				fetchState,
				toProgress: (response) => response,
				isTerminal: terminal,
				timeoutMs: 2500,
			}),
		)
		poller.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		expect(fetchState).toHaveBeenCalledTimes(1)
		setVisibility("hidden")
		expect(poller.connection).toBe("paused")
		expect(vi.getTimerCount()).toBe(0)
		await vi.advanceTimersByTimeAsync(10_000)
		expect(fetchState).toHaveBeenCalledTimes(1)
		setVisibility("visible")
		await vi.advanceTimersByTimeAsync(0)
		expect(fetchState).toHaveBeenCalledTimes(2)
		expect(poller.connection).toBe("live")
		await vi.advanceTimersByTimeAsync(2000)
		expect(poller.connection).toBe("live")
		poller.close()
	})

	test("an abort signal closes the watch", async () => {
		vi.useFakeTimers()
		const caller = new AbortController()
		const fetchState = vi.fn(async () => ({ status: "running", current: 1 }))
		const poller = new JobPoller(
			options({
				fetchState,
				toProgress: (response) => response,
				isTerminal: terminal,
				signal: caller.signal,
			}),
		)
		poller.attach(() => () => {})
		await vi.advanceTimersByTimeAsync(0)
		expect(poller.connection).toBe("live")
		caller.abort()
		expect(poller.connection).toBe("closed")
		await vi.advanceTimersByTimeAsync(5000)
		expect(fetchState).toHaveBeenCalledTimes(1)
	})
})
