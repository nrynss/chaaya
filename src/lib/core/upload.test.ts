import { describe, expect, test } from "vitest"
import type { Uploader } from "./upload"

/** A stand-in that records the calls and speaks no protocol. */
class MemoryUploader implements Uploader {
	readonly blocks: Uint8Array<ArrayBuffer>[] = []
	started = false
	finished = false

	async start(): Promise<void> {
		this.started = true
	}

	append(bytes: Uint8Array<ArrayBuffer>): void {
		this.blocks.push(bytes)
	}

	async finish(): Promise<void> {
		this.finished = true
	}
}

describe("uploader", () => {
	test("a caller opens, appends, and finishes without a protocol", async () => {
		const upload = new MemoryUploader()
		await upload.start()
		upload.append(new Uint8Array([1, 2, 3]))
		await upload.finish()
		expect(upload.started).toBe(true)
		expect(upload.blocks).toHaveLength(1)
		expect(upload.finished).toBe(true)
	})
})
