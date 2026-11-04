// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import { createElement, StrictMode, useState, type ReactElement } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { Notifier, type Listener, type Observable } from "../core/observable.js"
import { JobStream } from "../core/job/job.js"
import type { JobFrameAction } from "../core/job/types.js"
import type { NamedEvent } from "../core/sse/frame.js"
import { FrameLoop } from "../core/sse/loop.js"
import { createEventStream } from "../core/sse/events.js"
import { JobPoller } from "../core/job/poll.js"
import { SessionGuard } from "../guard/session-guard.js"
import { PricedAction } from "../priced/priced-action.js"
import { useAttached, useObservable } from "./index.js"

// React asks for this flag before it trusts act() outside its own runner.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

/** Let queued microtasks, a deferred teardown among them, run. */
async function flushMicrotasks(): Promise<void> {
	await Promise.resolve()
	await Promise.resolve()
}

function eventFrame(name: string, id: number, data = "{}"): string {
	return [`event: ${name}`, `id: ${id}`, `data: ${data}`, "", ""].join("\n")
}

/** A response body that serves its frames, then closes or stays open. */
function streamOf(frames: string[], close: boolean): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder()
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const frame of frames) controller.enqueue(encoder.encode(frame))
			if (close) controller.close()
		}
	})
}

/** One render of a probe: the version it read, and the text it showed. */
interface Rendered {
	version: number
	text: string
}

/** A component that reads one observable through the hook, optionally
 * attaches it, and logs every render. */
function probe<T extends Observable>(
	target: T,
	read: (target: T) => string,
	log: Rendered[],
	attached = false
): ReactElement {
	function Probe(): ReactElement {
		const live = useObservable(target)
		if (attached) useAttached(live as unknown as { attach(): () => void })
		const text = read(live)
		log.push({ version: live.version, text })
		return createElement("output", null, text)
	}
	return createElement(Probe)
}

/** One notification, one render: every render after the first reads a
 * newer version than the one before it, and the last one read the latest. */
function expectOneRenderPerNotify(log: Rendered[], target: Observable): void {
	const versions = log.map((entry) => entry.version)
	for (let index = 1; index < versions.length; index += 1) {
		expect(versions[index]).toBeGreaterThan(versions[index - 1])
	}
	expect(versions.at(-1)).toBe(target.version)
}

describe("useObservable and useAttached", () => {
	test("a FrameLoop renders its frames through a reconnect that resends Last-Event-ID", async () => {
		vi.useFakeTimers()
		const fetchMock = vi
			.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
			.mockResolvedValueOnce(new Response(streamOf([eventFrame("alpha", 1), eventFrame("alpha", 2)], true)))
			.mockResolvedValueOnce(new Response(streamOf([eventFrame("alpha", 3)], false)))
		vi.stubGlobal("fetch", fetchMock)
		const loop = new FrameLoop({
			url: "http://react.test/events",
			reconnect: { baseMs: 500, maxMs: 500, attempts: 3 },
			onFrame: () => ({ keep: true })
		})
		const log: Rendered[] = []
		const view = render(probe(loop, (l) => `${l.connection}:${l.lastEventId}:${l.reconnects}`, log, true))
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0)
		})
		expect(view.container.textContent).toBe("reconnecting:2:0")
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})
		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("last-event-id")).toBe("2")
		expect(view.container.textContent).toBe("live:3:1")
		expectOneRenderPerNotify(log, loop)
		view.unmount()
		await flushMicrotasks()
		expect(loop.connection).toBe("closed")
	})

	test("a JobStream renders its progress up to a terminal state", async () => {
		const readingOf = (frame: NamedEvent): JobFrameAction => {
			if (frame.name === "done") return { kind: "terminal", reading: { status: "done" } }
			const data = JSON.parse(frame.data) as { current: number }
			return { kind: "progress", reading: { current: data.current, total: 3, status: "running" } }
		}
		const body = streamOf(
			[eventFrame("progress", 1, '{"current":1}'), eventFrame("progress", 2, '{"current":2}'), eventFrame("done", 3)],
			false
		)
		vi.stubGlobal("fetch", vi.fn(async () => new Response(body)))
		const stream = new JobStream({
			url: "http://react.test/job",
			frameMap: { progress: readingOf, done: readingOf },
			reconnect: { baseMs: 0, maxMs: 0, attempts: 1 }
		})
		const log: Rendered[] = []
		const view = render(
			probe(stream, (s) => `${s.connection}:${s.progress.status ?? "-"}:${s.progress.current ?? "-"}/${s.progress.total ?? "-"}`, log, true)
		)
		await act(async () => {
			await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		})
		expect(view.container.textContent).toBe("closed:done:2/3")
		expectOneRenderPerNotify(log, stream)
		expect(log.map((entry) => entry.text)).toContain("live:running:1/3")
	})

	test("a PricedAction renders one render per notify through quote, confirm and run", async () => {
		let finish!: (value: string) => void
		const action = new PricedAction<string>({
			quote: async () => ({ id: "q1", price: { amount: 40, currency: "credit.label" } }),
			run: (id) => new Promise<string>((resolve) => (finish = (value) => resolve(`${value} ${id}`)))
		})
		const log: Rendered[] = []
		const view = render(probe(action, (a) => `${a.phase}:${a.quote?.price.amount ?? "-"}:${a.result ?? "-"}`, log))
		expect(log).toHaveLength(1)
		await act(async () => {
			await action.requestQuote()
		})
		expect(view.container.textContent).toBe("quoted:40:-")
		let confirmed!: Promise<string | undefined>
		await act(async () => {
			confirmed = action.confirm()
		})
		expect(view.container.textContent).toBe("running:40:-")
		await act(async () => {
			finish("ran")
			await confirmed
		})
		expect(view.container.textContent).toBe("done:40:ran q1")
		// Each step above notified separately, so each one rendered exactly
		// once: the mount, plus one render per notification.
		expect(log).toHaveLength(1 + action.version)
		expectOneRenderPerNotify(log, action)
	})

	test("a notify that changes nothing a render reads still renders once, and only once", () => {
		const target = new (class extends Notifier {
			ping(): void {
				this.notify()
			}
		})()
		const log: Rendered[] = []
		render(probe(target, () => "same", log))
		act(() => target.ping())
		act(() => target.ping())
		expect(log).toHaveLength(3)
	})

	test("an observable with subscribe on its prototype keeps its receiver, and unmount unsubscribes", () => {
		class Plain implements Observable {
			#listeners = new Set<Listener>()
			#version = 0
			get version(): number {
				return this.#version
			}
			subscribe(listener: Listener): () => void {
				this.#listeners.add(listener)
				return () => this.#listeners.delete(listener)
			}
			bump(): void {
				this.#version += 1
				for (const listener of this.#listeners) listener()
			}
			get listening(): number {
				return this.#listeners.size
			}
		}
		const plain = new Plain()
		const log: Rendered[] = []
		const view = render(probe(plain, (p) => String(p.version), log))
		expect(plain.listening).toBe(1)
		act(() => plain.bump())
		expect(view.container.textContent).toBe("1")
		view.unmount()
		expect(plain.listening).toBe(0)
	})

	test("a new target moves the subscription", () => {
		class Pinger extends Notifier {
			ping(): void {
				this.notify()
			}
		}
		const first = new Pinger()
		const second = new Pinger()
		let swap!: () => void
		let renders = 0
		function Swapper(): ReactElement {
			const [target, setTarget] = useState(first)
			swap = () => setTarget(second)
			useObservable(target)
			renders += 1
			return createElement("output", null, target === first ? "first" : "second")
		}
		const view = render(createElement(Swapper))
		act(() => swap())
		expect(view.container.textContent).toBe("second")
		const settled = renders
		act(() => first.ping())
		expect(renders).toBe(settled)
		act(() => second.ping())
		expect(renders).toBe(settled + 1)
	})

	test("useAttached attaches once under Strict Mode and tears down a microtask after unmount", async () => {
		const calls: string[] = []
		const target = {
			attach(): () => void {
				calls.push("attach")
				return () => calls.push("teardown")
			}
		}
		function Holder(): ReactElement {
			useAttached(target)
			calls.push("render")
			return createElement("output")
		}
		const view = render(createElement(StrictMode, null, createElement(Holder)))
		await flushMicrotasks()
		// Strict Mode unmounts and remounts the effect at once. The teardown
		// waits a microtask, the remount cancels it, and the attach stays.
		expect(calls.filter((call) => call !== "render")).toEqual(["attach"])
		expect(calls.indexOf("attach")).toBeGreaterThan(calls.indexOf("render"))
		view.unmount()
		expect(calls.filter((call) => call !== "render")).toEqual(["attach"])
		await flushMicrotasks()
		expect(calls.filter((call) => call !== "render")).toEqual(["attach", "teardown"])
	})

	test("a new target attaches at once and the old one tears down a microtask later", async () => {
		const calls: string[] = []
		const make = (name: string) => ({
			attach(): () => void {
				calls.push(`attach ${name}`)
				return () => calls.push(`teardown ${name}`)
			}
		})
		const first = make("a")
		const second = make("b")
		let swap!: () => void
		function Holder(): ReactElement {
			const [target, setTarget] = useState(first)
			swap = () => setTarget(second)
			useAttached(target)
			return createElement("output")
		}
		const view = render(createElement(StrictMode, null, createElement(Holder)))
		await flushMicrotasks()
		act(() => swap())
		await flushMicrotasks()
		expect(calls).toEqual(["attach a", "attach b", "teardown a"])
		view.unmount()
		await flushMicrotasks()
		expect(calls).toEqual(["attach a", "attach b", "teardown a", "teardown b"])
	})

	test("a remount under a new key adopts the live attachment of the same target", async () => {
		const calls: string[] = []
		let teardown: (() => void) | null = null
		// Like ClipScheduler: a second attach returns the same teardown.
		const target = {
			attach(): () => void {
				if (teardown !== null) return teardown
				calls.push("attach")
				teardown = () => {
					calls.push("teardown")
					teardown = null
				}
				return teardown
			}
		}
		function Holder(): ReactElement {
			useAttached(target)
			return createElement("output")
		}
		let rekey!: () => void
		function Parent(): ReactElement {
			const [key, setKey] = useState(0)
			rekey = () => setKey((k) => k + 1)
			return createElement(Holder, { key })
		}
		const view = render(createElement(Parent))
		act(() => rekey())
		await flushMicrotasks()
		expect(calls).toEqual(["attach"])
		view.unmount()
		await flushMicrotasks()
		expect(calls).toEqual(["attach", "teardown"])
	})

	test("useAttached refuses an attach that returns no teardown", () => {
		function Bad(): ReactElement {
			useAttached({ attach: () => undefined as unknown as () => void })
			return createElement("output")
		}
		vi.spyOn(console, "error").mockImplementation(() => {})
		expect(() => render(createElement(Bad))).toThrow(TypeError)
	})

	test("useObservable refuses a value with no subscribe", () => {
		function Bad(): ReactElement {
			useObservable({} as unknown as Observable)
			return createElement("output")
		}
		vi.spyOn(console, "error").mockImplementation(() => {})
		expect(() => render(createElement(Bad))).toThrow(TypeError)
	})
})

describe("the closing classes survive Strict Mode", () => {
	/** A component under Strict Mode that reads and attaches one target. */
	function strict<T extends Observable & { attach(): () => void }>(target: T, read: (t: T) => string): ReactElement {
		function Holder(): ReactElement {
			const live = useObservable(target)
			useAttached(live)
			return createElement("output", null, read(live))
		}
		return createElement(StrictMode, null, createElement(Holder))
	}

	test("a FrameLoop stays live with one connection", async () => {
		const fetchMock = vi.fn(async () => new Response(streamOf([eventFrame("alpha", 1)], false)))
		vi.stubGlobal("fetch", fetchMock)
		const loop = new FrameLoop({ url: "http://strict.test/loop", onFrame: () => ({ keep: true }) })
		const view = render(strict(loop, (l) => `${l.connection}:${l.lastEventId}`))
		await act(async () => {
			await vi.waitFor(() => expect(loop.lastEventId).toBe(1))
		})
		expect(view.container.textContent).toBe("live:1")
		expect(fetchMock).toHaveBeenCalledTimes(1)
		view.unmount()
		await flushMicrotasks()
		expect(loop.connection).toBe("closed")
	})

	test("a JobStream reaches its terminal state", async () => {
		const readingOf = (frame: NamedEvent): JobFrameAction =>
			frame.name === "done"
				? { kind: "terminal", reading: { status: "done" } }
				: { kind: "progress", reading: { current: 1, status: "running" } }
		vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([eventFrame("progress", 1), eventFrame("done", 2)], false))))
		const stream = new JobStream({ url: "http://strict.test/job", frameMap: { progress: readingOf, done: readingOf }, reconnect: { baseMs: 0, maxMs: 0, attempts: 1 } })
		const view = render(strict(stream, (s) => `${s.connection}:${s.progress.status ?? "-"}`))
		await act(async () => {
			await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		})
		expect(view.container.textContent).toBe("closed:done")
		expect(stream.progress.status).toBe("done")
	})

	test("createEventStream keeps receiving events", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([eventFrame("note", 1), eventFrame("note", 2)], false))))
		const events = createEventStream("http://strict.test/events")
		const view = render(strict(events, (e) => `${e.connection}:${e.events.length}`))
		await act(async () => {
			await vi.waitFor(() => expect(events.events.length).toBe(2))
		})
		expect(view.container.textContent).toBe("live:2")
		view.unmount()
		await flushMicrotasks()
		expect(events.connection).toBe("closed")
	})

	test("a JobPoller keeps polling to its terminal reading", async () => {
		let reads = 0
		const poller = new JobPoller<number>({
			fetchState: async () => (reads += 1),
			toProgress: (n) => ({ current: n, status: n >= 2 ? "done" : "running" }),
			isTerminal: (reading) => reading.status === "done",
			intervalMs: 1,
			maxIntervalMs: 1
		})
		const view = render(strict(poller, (p) => `${p.connection}:${p.progress.current ?? "-"}`))
		await act(async () => {
			await vi.waitFor(() => expect(poller.progress.status).toBe("done"))
		})
		expect(view.container.textContent).toContain(":2")
		expect(reads).toBe(2)
	})

	test("a SessionGuard sends no close during the Strict Mode remount, and one on unmount", async () => {
		const beacon = vi.fn(() => true)
		vi.stubGlobal("navigator", { sendBeacon: beacon })
		const guard = new SessionGuard({ url: "http://strict.test/close" })
		const view = render(strict(guard, (g) => String(g.closed)))
		await flushMicrotasks()
		expect(beacon).not.toHaveBeenCalled()
		expect(view.container.textContent).toBe("false")
		window.dispatchEvent(new Event("pagehide"))
		expect(beacon).toHaveBeenCalledTimes(1)
		view.unmount()
		await flushMicrotasks()
		expect(beacon).toHaveBeenCalledTimes(1)
	})

	test("an unmounted guard closes once, a microtask after unmount", async () => {
		const beacon = vi.fn(() => true)
		vi.stubGlobal("navigator", { sendBeacon: beacon })
		const guard = new SessionGuard({ url: "http://strict.test/close" })
		const view = render(strict(guard, (g) => String(g.closed)))
		await flushMicrotasks()
		view.unmount()
		expect(beacon).not.toHaveBeenCalled()
		await flushMicrotasks()
		expect(beacon).toHaveBeenCalledTimes(1)
		expect(guard.closed).toBe(true)
	})
})
