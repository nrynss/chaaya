import { describe, expect, test } from "vitest"
import { formatNamedFrame, parseNamedFrame, takeFrames } from "../core/sse/frame.js"
import { createJobStreamResponse } from "./stream.js"

async function readText(response: Response): Promise<string> {
	expect(response.headers.get("content-type")).toBe("text/event-stream")
	expect(response.headers.get("cache-control")).toBe("no-cache")
	return await response.text()
}

describe("createJobStreamResponse", () => {
	test("writes NamedFrameFields the reader round-trips", async () => {
		const response = createJobStreamResponse([
			{ id: 1, event: "progress", data: '{"step":"encode","done":1,"of":2}' },
			{ id: 2, event: "done", data: "{}" },
		])
		const body = await readText(response)
		const taken = takeFrames(body)
		expect(taken.rest).toBe("")
		expect(taken.frames).toHaveLength(2)
		const first = parseNamedFrame(taken.frames[0] ?? "")
		expect(first.ok && first.value.kind === "event" && first.value.name).toBe("progress")
		const second = parseNamedFrame(taken.frames[1] ?? "")
		expect(second.ok && second.value.kind === "event" && second.value.name).toBe("done")
	})

	test("accepts already-formatted frame text and comments", async () => {
		const response = createJobStreamResponse([
			formatNamedFrame({ comment: "ping" }),
			formatNamedFrame({ id: 3, event: "progress", data: '{"done":2,"of":2}' }),
		])
		const body = await readText(response)
		const taken = takeFrames(body)
		expect(taken.frames).toHaveLength(2)
		const comment = parseNamedFrame(taken.frames[0] ?? "")
		expect(comment.ok && comment.value.kind).toBe("comment")
	})

	test("drains an async iterable and stops on abort", async () => {
		const controller = new AbortController()
		async function* frames() {
			yield { id: 1, event: "progress", data: '{"done":0,"of":3}' }
			controller.abort()
			yield { id: 2, event: "progress", data: '{"done":1,"of":3}' }
			yield { id: 3, event: "done", data: "{}" }
		}
		const response = createJobStreamResponse(frames(), { signal: controller.signal })
		const body = await readText(response)
		const taken = takeFrames(body)
		// first frame was enqueued before abort; later ones must not appear
		expect(taken.frames.length).toBeLessThanOrEqual(2)
		expect(body).toContain("event: progress")
		expect(body).not.toContain("event: done")
	})

	test("caller headers merge and cannot override content-type", async () => {
		const response = createJobStreamResponse([{ event: "done", data: "{}" }], {
			headers: { "x-job": "1", "content-type": "text/plain", "cache-control": "no-store" },
		})
		expect(response.headers.get("content-type")).toBe("text/event-stream")
		expect(response.headers.get("cache-control")).toBe("no-store")
		expect(response.headers.get("x-job")).toBe("1")
		await response.text()
	})

	test("a pre-aborted signal yields an empty stream", async () => {
		const signal = AbortSignal.abort()
		const response = createJobStreamResponse([{ event: "done", data: "{}" }], { signal })
		expect(await readText(response)).toBe("")
	})

	test("a client cancel stops later frames without a signal", async () => {
		let release: () => void = () => {}
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		async function* frames() {
			yield { id: 1, event: "progress", data: "{}" }
			await gate
			yield { id: 2, event: "done", data: "{}" }
		}
		const response = createJobStreamResponse(frames())
		const reader = response.body?.getReader()
		if (!reader) throw new Error("missing body")
		const first = await reader.read()
		expect(first.done).toBe(false)
		const pending = reader.cancel()
		release()
		await pending
		const rest = await reader.read()
		expect(rest.done).toBe(true)
		const text = new TextDecoder().decode(first.value)
		expect(text).toContain("event: progress")
		expect(text).not.toContain("event: done")
	})
})
