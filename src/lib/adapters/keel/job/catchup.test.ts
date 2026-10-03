// @vitest-environment jsdom
/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest"
import { JobStream } from "./job.svelte"
import type { JobSnapshot } from "./types"

const jobId = "3f9a1c7e5b2d8046a1c3e5f7092b4d68"
const otherJobId = "9c1d5a3b7e2f40689b0d2c4e6f8a1b35"

/** One progress frame reporting the given work on the fixture job. */
function progressFrame(id: number, current: number): string {
	return [
		"event: progress",
		`id: ${id}`,
		`data: {"job_id":"${jobId}","stage":"transcoding","current":${current},"total":12}`,
		"",
		""
	].join("\n")
}

/** One terminal frame ending the fixture job. */
function doneFrame(id: number): string {
	return ["event: done", `id: ${id}`, `data: {"job_id":"${jobId}","status":"done"}`, "", ""].join(
		"\n"
	)
}

/** A stream whose reader serves one chunk per frame, then stays open. */
function streamOf(frames: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder()
	const chunks = frames.map((frame) => encoder.encode(frame))
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk)
		}
	})
}

/** A fetch that serves the given frames on the event path. */
function serveStream(frames: string[]): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: unknown) => {
			if (String(url).endsWith("/events")) {
				return new Response(streamOf(frames), {
					headers: { "content-type": "text/event-stream" }
				})
			}
			throw new Error(`unexpected fetch of ${String(url)}`)
		})
	)
}

afterEach(() => {
	vi.unstubAllGlobals()
})
/** Let the snapshot's translation into a catch-up run. That translation is one
 * promise reaction, then the core stream applies it. */
async function settleCatchUp(): Promise<void> {
	await Promise.resolve()
	await Promise.resolve()
}

/** Follow one job with the given frames and one held state answer. The answer
 * waits until the frames land, so the snapshot always races from behind. */
async function follow(frames: string[], snapshot: JobSnapshot): Promise<JobStream> {
	serveStream(frames)
	const release = Promise.withResolvers<JobSnapshot>()
	const stream = new JobStream({
		url: "http://job.test/events",
		fetchState: () => release.promise
	})
	stream.attach(() => () => {})
	await vi.waitFor(() => expect(stream.events.length).toBe(frames.length), { timeout: 2000 })
	release.resolve(snapshot)
	await vi.waitFor(() => expect(stream.connection).not.toBe("connecting"), { timeout: 2000 })
	await settleCatchUp()
	return stream
}

describe("catch-up freshness", () => {
	test("a late snapshot never overwrites newer stream progress", async () => {
		const stream = await follow([progressFrame(2, 3)], {
			jobId,
			status: "running",
			stage: "transcoding",
			current: 1,
			total: 12
		})
		expect(stream.current).toBe(3)
		expect(stream.stage).toBe("transcoding")
		expect(stream.status).toBe("running")
		stream.close()
	})

	test("a terminal frame without progress preserves the regression", async () => {
		const stream = await follow([progressFrame(2, 3)], {
			jobId,
			status: "done"
		})
		expect(stream.current).toBe(3)
		expect(stream.status).toBe("running")
		stream.close()
	})

	test("a terminal frame still ends a stream the snapshot has not passed", async () => {
		const stream = await follow([doneFrame(4)], {
			jobId,
			status: "running",
			stage: "transcoding",
			current: 4,
			total: 12
		})
		expect(stream.status).toBe("done")
		expect(stream.events.map((event) => event.name)).toEqual(["done"])
		stream.close()
	})

	test("a newer snapshot still lands after earlier stream progress", async () => {
		const stream = await follow([progressFrame(2, 3)], {
			jobId,
			status: "running",
			stage: "uploading",
			current: 9,
			total: 12
		})
		expect(stream.current).toBe(9)
		expect(stream.stage).toBe("uploading")
		stream.close()
	})

	test("a snapshot still lands before any stream progress arrives", async () => {
		const stream = await follow([], {
			jobId,
			status: "running",
			stage: "transcoding",
			current: 4,
			total: 12
		})
		expect(stream.current).toBe(4)
		expect(stream.status).toBe("running")
		stream.close()
	})

	test("a snapshot for another job does not land", async () => {
		const stream = await follow([progressFrame(2, 3)], {
			jobId: otherJobId,
			status: "running",
			stage: "uploading",
			current: 9,
			total: 12
		})
		expect(stream.current).toBe(3)
		expect(stream.stage).toBe("transcoding")
		expect(stream.status).toBe("running")
		stream.close()
	})

	test("an error frame ends the stream before a late snapshot", async () => {
		const frame = [
			"event: error",
			"id: 5",
			`data: {"job_id":"${jobId}","status":"error","error":{"error":{"code":"upstream_failed","message":"The media service failed.","detail":{"attempts":3}}}}`,
			"",
			""
		].join("\n")
		const stream = await follow([frame], {
			jobId,
			status: "running",
			stage: "transcoding",
			current: 1,
			total: 12
		})
		expect(stream.status).toBe("error")
		expect(stream.connection).toBe("closed")
		expect(stream.error).toEqual({
			code: "upstream_failed",
			message: "The media service failed.",
			detail: { attempts: 3 }
		})
		expect(stream.current).toBeUndefined()
		stream.close()
	})

	test("a terminal snapshot publishes its error", async () => {
		const stream = await follow([], {
			jobId,
			status: "error",
			error: { code: "upstream_failed", message: "The media service failed." }
		})
		expect(stream.status).toBe("error")
		expect(stream.connection).toBe("closed")
		expect(stream.error).toEqual({ code: "upstream_failed", message: "The media service failed." })
		stream.close()
	})

	test("a duplicate frame and a heartbeat do not land", async () => {
		serveStream([": ping\n\n", progressFrame(2, 3), progressFrame(2, 9)])
		const release = Promise.withResolvers<JobSnapshot>()
		const stream = new JobStream({
			url: "http://job.test/events",
			fetchState: () => release.promise
		})
		stream.attach(() => () => {})
		await vi.waitFor(() => expect(stream.events).toHaveLength(1), { timeout: 2000 })
		release.resolve({ jobId, status: "running", current: 1, total: 12 })
		await vi.waitFor(() => expect(stream.connection).toBe("live"), { timeout: 2000 })
		await settleCatchUp()
		expect(stream.events.map((event) => event.name)).toEqual(["progress"])
		expect(stream.current).toBe(3)
		stream.close()
	})
})
