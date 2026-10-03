// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import type { NamedEvent } from "./frame"
import { FrameBuffer, createEventStream } from "./events.svelte"
import { FrameLoop } from "./loop.svelte"

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

function eventFrame(name: string, id: number, data: string): string {
	return [`event: ${name}`, `id: ${id}`, `data: ${data}`, "", ""].join("\n")
}

function streamOf(frames: string[], close = true): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder()
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const frame of frames) controller.enqueue(encoder.encode(frame))
			if (close) controller.close()
		},
	})
}

describe("named event stream", () => {
	test("named events land, a comment is liveness, and a filter drops other names", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						streamOf([
							"id: 9\n: ping\n\n",
							eventFrame("alpha", 1, '{"n":1}'),
							"id: bad\n\n",
							eventFrame("beta", 2, '{"n":2}'),
							eventFrame("ended", 3, '{"reason":"done"}'),
						]),
						{ status: 200 },
					),
			),
		)
		const seen: string[] = []
		const comments: string[] = []
		const stream = createEventStream("http://notify.test/events", {
			events: ["alpha", "ended"],
			terminal: ["ended"],
			reconnect: { baseMs: 0, maxMs: 0, attempts: 1 },
			onFrame: (event) => {
				seen.push(event.name)
			},
			onComment: (comment) => {
				comments.push(comment)
			},
		})
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		expect(stream.events.map((event) => event.name)).toEqual(["alpha", "ended"])
		expect(seen).toEqual(["alpha", "ended"])
		expect(comments).toEqual(["ping"])
		expect(stream.lastComment).toEqual(expect.any(Number))
		expect(stream.events.some((event) => event.name === "ping")).toBe(false)
		expect(stream.lastEventId).toBe(3)
		const headers = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers)
		expect(headers.get("last-event-id")).toBeNull()
	})

	test("FrameLoop onComment receives the comment text and ignores an id on it", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(streamOf(["id: 9\n: ping\n\n"], false), { status: 200 })),
		)
		const comments: unknown[] = []
		const loop = new FrameLoop({
			url: "http://notify.test/events",
			reconnect: { baseMs: 0, maxMs: 0, attempts: 1 },
			onFrame: () => ({ keep: true }),
			onComment: (comment) => {
				comments.push(comment)
			},
		})
		loop.attach(() => () => {})
		await vi.waitFor(() => expect(comments).toEqual(["ping"]))
		expect(typeof comments[0]).toBe("string")
		expect(loop.lastEventId).toBe(0)
		loop.close()
	})

	test("a throwing onComment drops the comment and does not reconnect", async () => {
		const fetchMock = vi.fn(async () => new Response(streamOf([": ping\n\n"], false), { status: 200 }))
		vi.stubGlobal("fetch", fetchMock)
		const loop = new FrameLoop({
			url: "http://notify.test/events",
			reconnect: { baseMs: 0, maxMs: 0, attempts: 3 },
			onFrame: () => ({ keep: true }),
			onComment: () => {
				throw new Error("caller bug")
			},
		})
		loop.attach(() => () => {})
		await vi.waitFor(() => expect(loop.lastComment).toEqual(expect.any(Number)))
		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(loop.connection).toBe("live")
		loop.close()
	})

	test("a refused stream fails without a retry", async () => {
		const fetchMock = vi.fn(async () => new Response("no", { status: 403 }))
		vi.stubGlobal("fetch", fetchMock)
		const stream = createEventStream("http://notify.test/events")
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("failed"))
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(stream.events).toEqual([])
	})

	test("a dropped stream reconnects with the last event id", async () => {
		let opened = 0
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				opened += 1
				if (opened === 1) {
					return new Response(streamOf([eventFrame("alpha", 4, "{}")]), { status: 200 })
				}
				expect(new Headers(init?.headers).get("last-event-id")).toBe("4")
				return new Response(streamOf([eventFrame("ended", 5, "{}")]), { status: 200 })
			}),
		)
		const reconnects: number[] = []
		const stream = createEventStream("http://notify.test/events", {
			terminal: ["ended"],
			reconnect: { baseMs: 0, maxMs: 0, attempts: 2 },
			onReconnect: (count) => {
				reconnects.push(count)
			},
		})
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		expect(stream.events.map((event) => event.id)).toEqual([4, 5])
		expect(reconnects).toEqual([1])
	})

	test("an empty id line clears Last-Event-ID before the reconnect", async () => {
		let opened = 0
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				opened += 1
				if (opened === 1) {
					return new Response(
						streamOf([
							eventFrame("alpha", 4, "{}"),
							["event: alpha", "id:", 'data: {"n":0}', "", ""].join("\n"),
						]),
						{ status: 200 },
					)
				}
				return new Response(streamOf([eventFrame("alpha", 1, '{"n":1}')], false), { status: 200 })
			}),
		)
		const stream = createEventStream("http://notify.test/events", {
			reconnect: { baseMs: 0, maxMs: 0, attempts: 2 },
		})
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.reconnects).toBe(1))
		const second = new Headers(vi.mocked(fetch).mock.calls[1]?.[1]?.headers)
		expect(second.get("last-event-id")).toBeNull()
		expect(stream.events.map((event) => event.id)).toEqual([4, 0, 1])
		stream.close()
	})

	test("catch-up fills a gap and a later frame does not repeat an id", async () => {
		let push: (frame: string) => void = () => {}
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				const encoder = new TextEncoder()
				push = (frame) => controller.enqueue(encoder.encode(frame))
			},
		})
		vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })))
		const release = Promise.withResolvers<NamedEvent[]>()
		const stream = createEventStream("http://notify.test/events", {
			catchUp: () => release.promise,
		})
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("live"))
		release.resolve([{ id: 2, name: "note", data: '{"n":2}' }])
		await vi.waitFor(() => expect(stream.events.map((event) => event.id)).toEqual([2]))
		push(eventFrame("note", 3, '{"n":3}'))
		push(eventFrame("note", 2, '{"n":2}'))
		await vi.waitFor(() => expect(stream.events.map((event) => event.id)).toEqual([2, 3]))
		stream.close()
		expect(stream.connection).toBe("closed")
	})

	test("prime adopts a handoff and the first connect omits Last-Event-ID", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(streamOf([eventFrame("alpha", 1, "{}"), eventFrame("beta", 2, "{}")], false), {
						status: 200,
					}),
			),
		)
		const buffer = new FrameBuffer()
		buffer.push({ id: 1, name: "alpha", data: "{}" })
		const stream = createEventStream("http://notify.test/events")
		stream.prime(buffer.drain())
		expect(buffer.events).toEqual([])
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.events).toHaveLength(2))
		expect(stream.events.map((event) => event.name)).toEqual(["alpha", "beta"])
		expect(stream.lastEventId).toBe(2)
		const headers = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers)
		expect(headers.get("last-event-id")).toBeNull()
		stream.close()
	})

	test("requestInit carries credentials and does not keep a caller accept", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(streamOf([eventFrame("alpha", 1, "{}")], false), { status: 200 })),
		)
		const stream = createEventStream("http://notify.test/events", {
			headers: { authorization: "Bearer t" },
			requestInit: { credentials: "include", headers: { accept: "application/json" } },
		})
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.events).toHaveLength(1))
		const init = vi.mocked(fetch).mock.calls[0]?.[1]
		const headers = new Headers(init?.headers)
		expect(headers.get("accept")).toBe("text/event-stream")
		expect(headers.get("authorization")).toBe("Bearer t")
		expect(init?.credentials).toBe("include")
		stream.close()
	})
})
