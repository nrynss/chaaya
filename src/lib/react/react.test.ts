// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import { createElement, StrictMode, useState, type ReactElement } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { Notifier, type Listener, type Observable } from "../core/observable.js"
import { JobStream } from "../core/job/job.js"
import type { JobFrameAction } from "../core/job/types.js"
import type { NamedEvent } from "../core/sse/frame.js"
import { FrameLoop } from "../core/sse/loop.js"
import { PricedAction } from "../priced/priced-action.js"
import { useAttached, useObservable } from "./index.js"

// React asks for this flag before it trusts act() outside its own runner.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

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

	test("useAttached attaches after mount and tears down on unmount, Strict Mode included", () => {
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
		// Strict Mode renders twice, then mounts, unmounts and mounts again.
		expect(calls.filter((call) => call !== "render")).toEqual(["attach", "teardown", "attach"])
		expect(calls.indexOf("attach")).toBeGreaterThan(calls.indexOf("render"))
		view.unmount()
		expect(calls.filter((call) => call !== "render")).toEqual(["attach", "teardown", "attach", "teardown"])
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
