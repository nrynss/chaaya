// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import { JobStream as KeelJobStream } from "../../adapters/keel/job/job.js"
import { JobPoller } from "../job/poll.js"
import { JobStream } from "../job/job.js"
import type { JobFrameAction } from "../job/types.js"
import { createEventStream } from "./events.js"
import type { NamedEvent } from "./frame.js"
import { FrameLoop } from "./loop.js"

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

function eventFrame(name: string, id: number, data: string): string {
	return [`event: ${name}`, `id: ${id}`, `data: ${data}`, "", ""].join("\n")
}

/** A stream that serves the first frames at once and hands back a push for
 * more. It stays open until a test closes it. */
function openStream(frames: string[]): { body: ReadableStream<Uint8Array>; push: (frame: string) => void } {
	const encoder = new TextEncoder()
	let control: ReadableStreamDefaultController<Uint8Array> | undefined
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			control = controller
			for (const frame of frames) controller.enqueue(encoder.encode(frame))
		},
	})
	return { body, push: (frame) => control?.enqueue(encoder.encode(frame)) }
}

function serve(body: ReadableStream<Uint8Array>): void {
	vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })))
}

const noRetry = { baseMs: 0, maxMs: 0, attempts: 1 }

function readingOf(frame: NamedEvent): JobFrameAction {
	const data = JSON.parse(frame.data) as { current?: number }
	if (frame.name === "done") return { kind: "terminal", reading: { status: "done" } }
	if (frame.name === "ping") return { kind: "ignore" }
	return { kind: "progress", reading: { current: data.current, status: "running" } }
}

describe("one notify per change", () => {
	test("a job stream notifies once per kept frame, and a terminal frame once", async () => {
		const { body } = openStream([
			eventFrame("progress", 1, '{"current":1}'),
			eventFrame("ping", 2, "{}"),
			eventFrame("note", 3, '{"current":9}'),
			eventFrame("progress", 4, '{"current":2}'),
			eventFrame("done", 5, "{}"),
		])
		serve(body)
		const stream = new JobStream({
			url: "http://notify.test/events",
			frameMap: { progress: readingOf, done: readingOf, ping: readingOf },
			reconnect: noRetry,
		})
		const seen: string[] = []
		stream.subscribe(() => seen.push(`${stream.connection}:${stream.frames.length}:${stream.progress.current ?? "-"}`))
		stream.attach()
		await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		// Live, two progress frames, and one terminal frame that also ends the
		// watch. The ignored and the unmapped frames notify nothing.
		expect(seen).toEqual(["live:0:-", "live:1:1", "live:2:2", "closed:3:2"])
		expect(stream.version).toBe(4)
	})

	test("a job stream keeps one frames reference between notifications and never mutates it", async () => {
		const { body, push } = openStream([eventFrame("progress", 1, '{"current":1}')])
		serve(body)
		const stream = new JobStream({
			url: "http://notify.test/events",
			frameMap: { progress: readingOf, done: readingOf },
			reconnect: noRetry,
		})
		stream.attach()
		await vi.waitFor(() => expect(stream.frames.length).toBe(1))
		const first = stream.frames
		const progress = stream.progress
		expect(stream.frames).toBe(first)
		expect(stream.progress).toBe(progress)
		push(eventFrame("progress", 2, '{"current":2}'))
		await vi.waitFor(() => expect(stream.frames.length).toBe(2))
		expect(stream.frames).not.toBe(first)
		expect(first).toHaveLength(1)
		expect(stream.progress).not.toBe(progress)
		stream.close()
	})

	test("a catch-up that lands and ends the watch notifies once", async () => {
		const { body } = openStream([])
		serve(body)
		const stream = new JobStream({
			url: "http://notify.test/events",
			frameMap: { progress: readingOf },
			reconnect: noRetry,
			fetchState: async () => ({ reading: { status: "done", current: 3 } }),
			isTerminal: (reading) => reading.status === "done",
		})
		const seen: string[] = []
		stream.subscribe(() => seen.push(`${stream.connection}:${stream.progress.status ?? "-"}`))
		stream.attach()
		await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		expect(seen).toEqual(["live:-", "closed:done"])
	})

	test("a named event stream notifies once per kept event and keeps the list reference", async () => {
		const { body, push } = openStream([
			eventFrame("alpha", 1, "{}"),
			eventFrame("other", 2, "{}"),
			": ping\n\n",
		])
		serve(body)
		const stream = createEventStream("http://notify.test/events", {
			events: ["alpha", "ended"],
			terminal: ["ended"],
			reconnect: noRetry,
		})
		const seen: string[] = []
		stream.subscribe(() => seen.push(`${stream.connection}:${stream.events.length}:${stream.lastComment === undefined ? "-" : "c"}`))
		stream.attach()
		await vi.waitFor(() => expect(stream.lastComment).toBeDefined())
		const list = stream.events
		expect(stream.events).toBe(list)
		push(eventFrame("ended", 3, "{}"))
		await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		// The filtered frame notifies nothing. The comment notifies once.
		expect(seen).toEqual(["live:0:-", "live:1:-", "live:1:c", "closed:2:c"])
		expect(list).toHaveLength(1)
		expect(stream.events).not.toBe(list)
	})

	test("prime notifies once per kept event, including one that ends the stream", () => {
		const stream = createEventStream("http://notify.test/events", { events: ["alpha", "ended"], terminal: ["ended"] })
		let heard = 0
		stream.subscribe(() => {
			heard += 1
		})
		stream.prime([
			{ id: 1, name: "alpha", data: "" },
			{ id: 2, name: "other", data: "" },
			{ id: 1, name: "alpha", data: "" },
			{ id: 3, name: "ended", data: "" },
		])
		expect(heard).toBe(2)
		expect(stream.events.map((event) => event.name)).toEqual(["alpha", "ended"])
		expect(stream.connection).toBe("closed")
		expect(stream.lastEventId).toBe(3)
	})

	test("the Keel stream re-notifies once per kept frame and replaces its event list", async () => {
		const jobId = "3f9a1c7e5b2d8046a1c3e5f7092b4d68"
		const { body } = openStream([
			eventFrame("progress", 1, `{"job_id":"${jobId}","stage":"a","current":1,"total":2}`),
			eventFrame("done", 2, `{"job_id":"${jobId}","status":"done"}`),
		])
		serve(body)
		const stream = new KeelJobStream({
			url: "http://notify.test/events",
			fetchState: () => new Promise(() => {}),
			reconnect: noRetry,
		})
		const lists: Array<readonly unknown[]> = []
		stream.subscribe(() => lists.push(stream.events))
		stream.attach()
		await vi.waitFor(() => expect(stream.status).toBe("done"))
		await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		expect(lists.map((list) => list.length)).toEqual([0, 1, 2])
		expect(lists[1]).not.toBe(lists[2])
		expect(lists[1]).toHaveLength(1)
	})

	test("a frame loop notifies once for a kept frame that moves the cursor and ends the watch", async () => {
		const { body } = openStream([eventFrame("x", 4, ""), eventFrame("y", 5, "")])
		serve(body)
		const loop = new FrameLoop({
			url: "http://notify.test/events",
			reconnect: noRetry,
			onFrame: (frame) => ({ keep: frame.name === "y", takeId: frame.name === "x" ? false : undefined, stop: frame.name === "y" }),
		})
		const seen: string[] = []
		loop.subscribe(() => seen.push(`${loop.connection}:${loop.lastEventId}`))
		loop.attach()
		await vi.waitFor(() => expect(loop.connection).toBe("closed"))
		expect(seen).toEqual(["live:0", "closed:5"])
	})

	test("noteId notifies only when the cursor moves", () => {
		const loop = new FrameLoop({ url: "http://notify.test/events", onFrame: () => ({ keep: true }) })
		let heard = 0
		loop.subscribe(() => {
			heard += 1
		})
		loop.noteId({ id: 3 })
		loop.noteId({ id: 2 })
		loop.noteId({ id: 3 })
		expect(heard).toBe(1)
		expect(loop.lastEventId).toBe(3)
	})
})

describe("the returned teardown", () => {
	test("stops a job stream, and no later frame notifies", async () => {
		const { body, push } = openStream([eventFrame("progress", 1, '{"current":1}')])
		serve(body)
		const stream = new JobStream({
			url: "http://notify.test/events",
			frameMap: { progress: readingOf },
			reconnect: noRetry,
		})
		let heard = 0
		stream.subscribe(() => {
			heard += 1
		})
		const teardown = stream.attach()
		await vi.waitFor(() => expect(stream.frames.length).toBe(1))
		teardown()
		expect(stream.connection).toBe("closed")
		const after = heard
		push(eventFrame("progress", 2, '{"current":2}'))
		await new Promise((resolve) => setTimeout(resolve, 20))
		expect(heard).toBe(after)
		expect(stream.frames).toHaveLength(1)
		teardown()
		expect(heard).toBe(after)
	})

	test("stops a poller, and no later tick notifies", async () => {
		vi.useFakeTimers()
		let reads = 0
		const poller = new JobPoller({
			fetchState: async () => {
				reads += 1
				return reads
			},
			toProgress: (count: number) => ({ current: count, status: "running" }),
			isTerminal: () => false,
			intervalMs: 100,
			pauseWhenHidden: false,
		})
		const seen: string[] = []
		poller.subscribe(() => seen.push(`${poller.connection}:${poller.progress.current ?? "-"}`))
		const teardown = poller.attach()
		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(100)
		expect(seen).toEqual(["live:1", "live:2"])
		teardown()
		await vi.advanceTimersByTimeAsync(1000)
		expect(seen).toEqual(["live:1", "live:2", "closed:2"])
		expect(reads).toBe(2)
	})
})
