// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { parseNamedFrame, takeFrames } from "../sse/frame"
import type { NamedEvent } from "../sse/frame"
import {
	plainApi,
	plainCatchUp,
	plainErrorParser,
	plainFrameMap,
	plainGate,
	plainIsTerminal,
	plainJobStream,
	writeDone,
	writeError,
	writeHeartbeat,
	writeProgress,
} from "../../../../docs/examples/plain-adapter"

function named(name: string, data: string, id = 1): NamedEvent {
	return { id, name, data, idSet: true }
}

function streamOf(body: string): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder()
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(body))
		},
	})
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("plain adapter", () => {
	test("the guide block is the example with public specifiers", () => {
		const source = readFileSync(join(process.cwd(), "docs/examples/plain-adapter.ts"), "utf8")
			.replaceAll("$lib/core/index.js", "@nrynss/chaaya/core")
			.replaceAll("$lib/auth/index.js", "@nrynss/chaaya/auth")
		const doc = readFileSync(join(process.cwd(), "docs/adapters.md"), "utf8")
		const start = "<!-- plain-adapter:start -->\n```ts\n"
		const end = "```\n<!-- plain-adapter:end -->"
		const at = doc.indexOf(start)
		expect(at).toBeGreaterThan(-1)
		const body = doc.slice(at + start.length, doc.indexOf(end, at))
		expect(body).toBe(source)
		expect(source).not.toMatch(/chaaya\/keel|adapters\/keel/)
	})

	test("parseError reads the failure document and leaves anything else", () => {
		const response = new Response()
		expect(plainErrorParser('{"failure":{"kind":"not_allowed","text":"Sign in.","again":false}}', response)).toEqual({
			code: "not_allowed",
			message: "Sign in.",
			detail: { again: false },
		})
		expect(plainErrorParser('{"error":{"code":"nope","message":"no"}}', response)).toBeUndefined()
		expect(plainErrorParser("not json", response)).toBeUndefined()
		expect(plainErrorParser('{"failure":{"kind":"","text":"x"}}', response)).toBeUndefined()
	})

	test("the client uses the parser", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response('{"failure":{"kind":"not_allowed","text":"Sign in."}}', { status: 401 })),
		)
		const call = plainApi()
		await expect(call("/jobs/1")).rejects.toMatchObject({ code: "not_allowed", message: "Sign in.", status: 401 })
	})

	test("frames map onto actions and a bad progress payload is ignored", () => {
		const map = plainFrameMap()
		const progress = map.progress(named("progress", '{"step":"encode","done":2,"of":10}'))
		expect(progress).toEqual({
			kind: "progress",
			reading: { status: "running", stage: "encode", current: 2, total: 10 },
		})
		expect(map.progress(named("progress", "[]")).kind).toBe("ignore")
		expect(map.done(named("done", "{}"))).toEqual({ kind: "terminal", reading: { status: "done" } })
		expect(map.error(named("error", '{"reason":"disk full","again":true}'))).toEqual({
			kind: "terminal",
			reading: { status: "error" },
			error: { code: "failed", message: "disk full", retryable: true },
		})
		expect(map.error(named("error", "nope"))).toEqual({
			kind: "terminal",
			reading: { status: "error" },
			error: { code: "unreadable", message: "the text does not hold valid JSON" },
		})
	})

	test("the writer round-trips through the reader", () => {
		const wire = [
			writeProgress({ id: 1, step: "encode", done: 2, of: 10, watch: "job-1" }),
			writeHeartbeat(),
			writeProgress({ id: 2, step: "encode", done: 10, of: 10, result: "/media/out.bin", watch: "job-1" }),
			writeDone(3, "job-1"),
			writeError(4, "disk full", false, "job-1"),
		].join("")
		const taken = takeFrames(wire)
		expect(taken.rest).toBe("")
		expect(taken.frames).toHaveLength(5)
		const parsed = taken.frames.map((frame) => parseNamedFrame(frame))
		expect(parsed.every((item) => item.ok)).toBe(true)
		const comment = parsed[1]
		expect(comment.ok && comment.value.kind).toBe("comment")
	})

	test("a catch-up treats failed as terminal and keeps the error beside the reading", () => {
		const failed = plainCatchUp({ step: "encode", done: 1, of: 10, failed: true, finished: true, reason: "disk full" })
		expect(failed.ok && failed.value).toEqual({
			reading: { status: "error", stage: "encode", current: 1, total: 10 },
			error: { code: "failed", message: "disk full" },
		})
		expect(failed.ok && plainIsTerminal(failed.value.reading)).toBe(true)
		const again = plainCatchUp({ step: "encode", done: 1, of: 10, failed: true, reason: "disk full", again: true })
		expect(again.ok && again.value.error).toEqual({ code: "failed", message: "disk full", retryable: true })
		const againOnly = plainCatchUp({ failed: true, again: false })
		expect(againOnly.ok && againOnly.value.error).toEqual({
			code: "failed",
			message: "the work stopped",
			retryable: false,
		})
		expect(plainCatchUp([]).ok).toBe(false)
	})

	test("the stream keeps the result from the last progress frame and drops another watch", async () => {
		const passcode = plainGate()
		passcode.set("open-sesame")
		const body = [
			writeProgress({ id: 1, step: "encode", done: 2, of: 10, watch: "job-1" }),
			writeProgress({ id: 2, step: "encode", done: 9, of: 10, watch: "job-2" }),
			writeHeartbeat(),
			writeProgress({ id: 3, step: "encode", done: 10, of: 10, result: "/media/out.bin", watch: "job-1" }),
			writeDone(4, "job-1"),
		].join("")
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(streamOf(body), { headers: { "content-type": "text/event-stream" } })),
		)
		const stream = plainJobStream({
			url: "http://job.test/events",
			watchId: "job-1",
			requestInit: passcode.apply({ credentials: "include" }),
		})
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		expect(stream.progress).toEqual({
			stage: "encode",
			current: 10,
			total: 10,
			status: "done",
			detail: { result: "/media/out.bin" },
		})
		expect(stream.error).toBeUndefined()
		expect(stream.frames.map((frame) => frame.name)).toEqual(["progress", "progress", "done"])
		expect(stream.lastComment).toEqual(expect.any(Number))
		const headers = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers)
		expect(headers.get("accept")).toBe("text/event-stream")
		expect(headers.get("x-app-passcode")).toBe("open-sesame")
		expect(vi.mocked(fetch).mock.calls[0]?.[1]?.credentials).toBe("include")
		stream.close()
	})

	test("a finished catch-up ends the watch", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(streamOf(writeHeartbeat()), { headers: { "content-type": "text/event-stream" } })),
		)
		const stream = plainJobStream({
			url: "http://job.test/events",
			watchId: "job-1",
			fetchState: async () => ({ step: "encode", done: 4, of: 10, finished: true, result: "/media/out.bin" }),
		})
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.connection).toBe("closed"))
		expect(stream.progress).toEqual({
			stage: "encode",
			current: 4,
			total: 10,
			status: "done",
			detail: { result: "/media/out.bin" },
		})
		stream.close()
	})
})
