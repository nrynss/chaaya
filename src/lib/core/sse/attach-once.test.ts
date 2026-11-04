// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { FrameLoop } from "./loop.js"
import { JobPoller } from "../job/index.js"

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

/** Count visibility listeners added and not yet removed. */
function openWatches(): () => number {
	const add = vi.spyOn(document, "addEventListener")
	const remove = vi.spyOn(document, "removeEventListener")
	const count = (calls: unknown[][]): number => calls.filter((call) => call[0] === "visibilitychange").length
	return () => count(add.mock.calls) - count(remove.mock.calls)
}

const pending = (): Promise<unknown> => new Promise<unknown>(() => {})

function loop(): FrameLoop {
	return new FrameLoop({ url: "http://attach.test/events", onFrame: () => ({ keep: true }) })
}

function poller(fetchState = vi.fn(pending)): JobPoller<unknown> {
	return new JobPoller({ fetchState, toProgress: () => ({}), isTerminal: () => false, intervalMs: 1000 })
}

test("a FrameLoop attached after its close opens no watch and no stream", () => {
	const fetchMock = vi.fn(pending)
	vi.stubGlobal("fetch", fetchMock)
	const watches = openWatches()
	const target = loop()
	target.attach()()
	const calls = fetchMock.mock.calls.length
	const again = target.attach()
	expect(watches()).toBe(0)
	expect(fetchMock.mock.calls.length).toBe(calls)
	again()
	expect(watches()).toBe(0)
})

test("a FrameLoop attached twice opens one watch and one stream", () => {
	const fetchMock = vi.fn(pending)
	vi.stubGlobal("fetch", fetchMock)
	const watches = openWatches()
	const target = loop()
	const first = target.attach()
	const second = target.attach()
	expect(fetchMock).toHaveBeenCalledTimes(1)
	expect(watches()).toBe(1)
	first()
	second()
	expect(watches()).toBe(0)
})

test("a JobPoller attached after its close opens no watch and no poll", () => {
	const fetchState = vi.fn(pending)
	const watches = openWatches()
	const target = poller(fetchState)
	target.attach()()
	const calls = fetchState.mock.calls.length
	target.attach()()
	expect(watches()).toBe(0)
	expect(fetchState.mock.calls.length).toBe(calls)
})

test("a JobPoller attached twice opens one watch and one poll", () => {
	const fetchState = vi.fn(pending)
	const watches = openWatches()
	const target = poller(fetchState)
	const first = target.attach()
	const second = target.attach()
	expect(fetchState).toHaveBeenCalledTimes(1)
	expect(watches()).toBe(1)
	first()
	second()
	expect(watches()).toBe(0)
})
