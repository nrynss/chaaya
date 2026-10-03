// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import type { JobProgress } from "../progress"
import type { JobFrameAction, JobStreamOptions } from "./types"
import type { NamedEvent } from "../sse/frame"
import { createJobStream } from "./index"
import { JobStream } from "./job.svelte"

function frame(name: string, id: number, data: string): string {
	return [`event: ${name}`, `id: ${id}`, `data: ${data}`, "", ""].join("\n")
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

function readingOf(frame: NamedEvent): JobFrameAction {
	const data = JSON.parse(frame.data) as { stage?: string; current?: number; total?: number; status?: string }
	if (frame.name === "ping") return { kind: "ignore" }
	if (frame.name === "done") return { kind: "terminal", reading: { status: data.status ?? "done" } }
	if (frame.name === "error") {
		return { kind: "terminal", reading: { status: "error" }, error: { code: "failed", message: "stopped" } }
	}
	return {
		kind: "progress",
		reading: { stage: data.stage, current: data.current, total: data.total, status: "running" },
	}
}

function options(extra: Partial<JobStreamOptions> = {}): JobStreamOptions {
	return {
		url: "http://job.test/events",
		frameMap: {
			progress: readingOf,
			done: readingOf,
			error: readingOf,
			ping: readingOf,
		},
		reconnect: { baseMs: 0, maxMs: 0, attempts: 1 },
		...extra,
	}
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("core job stream", () => {
	test("createJobStream returns a JobStream for the same options", () => {
		const given = options()
		const stream = createJobStream(given)
		expect(stream).toBeInstanceOf(JobStream)
		expect(stream.connection).toBe("connecting")
		expect(stream.progress).toEqual({})
		stream.close()
	})

	test("progress merges defined fields and a missing name is ignored", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						streamOf(
							[
								frame("progress", 1, '{"stage":"encode","current":2,"total":10}'),
								frame("note", 2, '{"current":8}'),
								frame("ping", 3, "{}"),
								frame("progress", 4, '{"current":3}'),
								": keep-alive\n\n",
							],
							false,
						),
						{ headers: { "content-type": "text/event-stream" } },
					),
			),
		)
		const stream = new JobStream(options())
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.progress.current).toBe(3))
		expect(stream.progress).toEqual({ stage: "encode", current: 3, total: 10, status: "running" })
		expect(stream.progress.id).toBeUndefined()
		expect(stream.frames.map((item) => item.name)).toEqual(["progress", "progress"])
		expect(stream.connection).toBe("live")
		const calls = vi.mocked(fetch).mock.calls
		expect(calls[0]?.[1]).toMatchObject({ headers: { accept: "text/event-stream" } })
		stream.close()
		expect(stream.connection).toBe("closed")
	})

	test("a terminal action ends the watch and a later frame does not land", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						streamOf(
							[
								frame("progress", 1, '{"stage":"encode","current":2,"total":10}'),
								frame("done", 2, '{"status":"done"}'),
								frame("progress", 3, '{"current":9}'),
							],
							false,
						),
					),
			),
		)
		const stream = new JobStream(options())
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		expect(stream.progress).toMatchObject({ stage: "encode", current: 2, total: 10, status: "done" })
		expect(stream.frames).toHaveLength(2)
		stream.close()
	})

	test("an error action publishes the failure and closes", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(streamOf([frame("error", 1, "{}")], false))),
		)
		const stream = new JobStream(options())
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		expect(stream.error).toEqual({ code: "failed", message: "stopped" })
		expect(stream.progress.status).toBe("error")
		stream.close()
	})

	test("a late catch-up does not move the counter backward", async () => {
		const release = Promise.withResolvers<JobProgress>()
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(streamOf([frame("progress", 1, '{"current":5,"stage":"encode"}')], false))),
		)
		const stream = new JobStream(
			options({
				fetchState: () => release.promise,
				isTerminal: (reading) => reading.status === "done" || reading.status === "error",
			}),
		)
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.progress.current).toBe(5))
		release.resolve({ current: 1, stage: "older", status: "done" })
		await vi.waitFor(() => expect(stream.connection).toBe("live"))
		expect(stream.progress.current).toBe(5)
		expect(stream.progress.stage).toBe("encode")
		expect(stream.connection).not.toBe("closed")
		stream.close()
	})

	test("a newer catch-up lands, and isTerminal is what closes it", async () => {
		const release = Promise.withResolvers<{ status: string; current: number }>()
		vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([], false))))
		const stream = new JobStream(
			options({
				fetchState: () => release.promise,
			}),
		)
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("live"))
		release.resolve({ status: "finished", current: 4 })
		await vi.waitFor(() => expect(stream.progress.status).toBe("finished"))
		expect(stream.connection).toBe("live")
		expect(stream.progress.current).toBe(4)
		stream.close()
	})

	test("isTerminal on a catch-up closes the watch", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([], false))))
		const stream = new JobStream(
			options({
				fetchState: async () => ({ status: "done", current: 1 }),
				isTerminal: (reading) => reading.status === "done",
			}),
		)
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		expect(stream.progress).toEqual({ status: "done", current: 1 })
		stream.close()
	})

	test("a refused stream fails once and does not reconnect", async () => {
		const fetchMock = vi.fn(async () => new Response("no", { status: 503 }))
		vi.stubGlobal("fetch", fetchMock)
		const stream = new JobStream(options())
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("failed"))
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(stream.reconnects).toBe(0)
		stream.close()
	})

	test("a stream that never opens fails without a retry", async () => {
		const fetchMock = vi.fn(async () => {
			throw new Error("down")
		})
		vi.stubGlobal("fetch", fetchMock)
		const stream = new JobStream(options({ reconnect: { baseMs: 0, attempts: 4 } }))
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("failed"))
		expect(fetchMock).toHaveBeenCalledTimes(1)
		stream.close()
	})

	test("an opened stream that drops reconnects and reports the count", async () => {
		let calls = 0
		const seen: number[] = []
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				calls += 1
				if (calls === 1) {
					return new Response(streamOf([frame("progress", 1, '{"current":1,"stage":"encode"}')], true))
				}
				return new Response(streamOf([frame("progress", 2, '{"current":2}')], false))
			}),
		)
		const stream = new JobStream(
			options({
				onReconnect: (count) => {
					seen.push(count)
				},
			}),
		)
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.reconnects).toBe(1))
		await vi.waitFor(() => expect(stream.progress.current).toBe(2))
		expect(seen).toEqual([1])
		expect(stream.progress.stage).toBe("encode")
		expect(stream.connection).toBe("live")
		stream.close()
	})

	test("shouldAccept drops a frame before the map runs", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						streamOf(
							[frame("progress", 1, '{"current":3,"stage":"encode"}'), frame("progress", 1, '{"current":9}')],
							false,
						),
					),
			),
		)
		const seen = new Set<number>()
		const stream = new JobStream(
			options({
				shouldAccept(frame) {
					if (seen.has(frame.id)) return false
					seen.add(frame.id)
					return true
				},
			}),
		)
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.frames).toHaveLength(1))
		await new Promise((resolve) => setTimeout(resolve, 20))
		expect(stream.progress.current).toBe(3)
		stream.close()
	})

	test("a rejected catch-up leaves the stream alone", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(streamOf([frame("progress", 1, '{"current":2,"stage":"encode"}')], false))),
		)
		const stream = new JobStream(
			options({
				fetchState: async () => {
					throw new Error("skip")
				},
			}),
		)
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("live"))
		expect(stream.progress.current).toBe(2)
		stream.close()
	})
})
