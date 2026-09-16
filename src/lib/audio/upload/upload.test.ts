/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest"
import begin from "../../wire/fixtures/upload-begin.json?raw"
import chunkAck from "../../wire/fixtures/upload-chunk.json?raw"
import completed from "../../wire/fixtures/upload-complete.json?raw"
import hashMismatch from "../../wire/fixtures/upload-hash-mismatch.json?raw"
import incomplete from "../../wire/fixtures/upload-incomplete.json?raw"
import notFound from "../../wire/fixtures/upload-not-found.json?raw"
import uploadState from "../../wire/fixtures/upload-state.json?raw"
import { ChunkBuffer, sha256Hex } from "./chunk"
import { parseUploadReceipt, parseUploadSnapshot, refusal } from "./protocol"
import { isRetryableStatus, retryDelayMs } from "./retry"
import { ChunkUploader } from "./upload.svelte"
import type { SessionRecord, StoredChunk, UploadStore } from "./types"

const uploadId = "00000000000000000000000000000001"
const base = "http://upload.test/uploads"
const chunkSize = 8
const goldenChunks = ["golden u", "pload by", "tes."]
const goldenDigest = "892aa7670fb3a9295602d1223e2a781b67604bfdfc5003b1cf952b6e3dd62597"
const goldenFirstDigest = "d127089a59e24c7c85996f207de6030ab15c52a9f36fc5490baaa3675ddb4f03"

function bytesOf(text: string): Uint8Array<ArrayBuffer> {
	return new TextEncoder().encode(text)
}

/** The bytes the recorded goldens were captured from. */
function goldenBytes(): Uint8Array<ArrayBuffer> {
	return bytesOf(goldenChunks.join(""))
}

/**
 * A server that speaks enough of the upload protocol for one test. Its answers
 * carry the same member names as the recorded goldens, so a test reads the
 * same accounting a real server reports.
 */
class UploadServer {
	readonly paths: string[] = []
	readonly chunks = new Map<number, Uint8Array>()
	/** How many chunk writes to refuse before the next one succeeds. */
	failures = 0
	/** A chunk index the server answers with a mismatch for. */
	mismatchIndex: number | undefined = undefined
	/** A chunk index the server forgets right after it acknowledges the write. */
	lostIndex: number | undefined = undefined
	/** How many chunk writes reached the server. */
	writes = 0
	/** How many completions succeeded. */
	completions = 0
	/** How many completions arrived before every chunk was held. */
	premature = 0

	readonly handle = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
		const method = init?.method ?? "GET"
		this.paths.push(`${method} ${url.pathname}`)

		if (url.pathname.endsWith("/complete")) return await this.#complete(init)
		const chunk = /\/chunks\/(\d+)$/.exec(url.pathname)
		if (chunk !== null) return await this.#write(Number(chunk[1]), init)
		if (method === "POST") return this.#answer(this.#state(), 201)
		return this.#answer(this.#state())
	}

	/** The state a read reports, exactly as the recorded goldens spell it. */
	#state(): unknown {
		const received = [...this.chunks.keys()].sort((left, right) => left - right)
		const missing: number[] = []
		for (let index = 0; index < goldenChunks.length; index += 1) {
			if (!this.chunks.has(index)) missing.push(index)
		}
		let stored = 0
		for (const chunk of this.chunks.values()) stored += chunk.byteLength
		return {
			id: uploadId,
			owner: "owner-1",
			content_type: "audio/webm",
			visibility: "private",
			chunk_size: chunkSize,
			size_bytes: goldenBytes().byteLength,
			chunk_count: goldenChunks.length,
			stored_bytes: stored,
			received,
			missing,
			expires_at: "2026-01-02T04:04:05Z"
		}
	}

	async #write(index: number, init?: RequestInit): Promise<Response> {
		this.writes += 1
		if (this.failures > 0) {
			this.failures -= 1
			return this.#answer({ error: { code: "unavailable", message: "The server is busy." } }, 503)
		}
		const body = init?.body
		const chunk = body instanceof Uint8Array ? new Uint8Array(body) : new Uint8Array(0)
		const declared = new Headers(init?.headers).get("x-chunk-sha256") ?? ""
		const actual = await sha256Hex(chunk)
		if (index === this.mismatchIndex || actual !== declared) {
			return this.#answer(
				{ error: { code: "chunk_mismatch", message: "The chunk does not match.", detail: { index, declared, actual } } },
				400
			)
		}
		this.chunks.set(index, chunk)
		const answer = this.#answer(this.#state())
		if (index === this.lostIndex) {
			this.chunks.delete(index)
			this.lostIndex = undefined
		}
		return answer
	}

	async #complete(init?: RequestInit): Promise<Response> {
		const missing = (this.#state() as { missing: number[] }).missing
		if (missing.length > 0) {
			this.premature += 1
			return this.#answer({ error: { code: "incomplete", message: "The upload is missing chunks.", detail: { missing } } }, 409)
		}
		const declared = JSON.parse(String(init?.body)) as { sha256: string }
		const actual = await sha256Hex(this.#assemble())
		if (actual !== declared.sha256) {
			return this.#answer(
				{ error: { code: "hash_mismatch", message: "The assembled upload does not match.", detail: { declared: declared.sha256, actual } } },
				409
			)
		}
		this.completions += 1
		return this.#answer({
			id: uploadId,
			owner: "owner-1",
			content_type: "audio/webm",
			visibility: "private",
			size_bytes: actual === goldenDigest ? goldenBytes().byteLength : this.#assemble().byteLength,
			sha256: actual
		})
	}

	/** The bytes the server holds, in index order. */
	#assemble(): Uint8Array<ArrayBuffer> {
		const parts = [...this.chunks.entries()].sort((left, right) => left[0] - right[0])
		let size = 0
		for (const part of parts) size += part[1].byteLength
		const all = new Uint8Array(size)
		let offset = 0
		for (const part of parts) {
			all.set(part[1], offset)
			offset += part[1].byteLength
		}
		return all
	}

	#answer(body: unknown, status = 200): Response {
		return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
	}
}

/** Keeps one upload in plain maps, so a test needs no database. */
class MemoryStore implements UploadStore {
	readonly sessions = new Map<string, SessionRecord>()
	readonly held = new Map<number, StoredChunk>()
	#current: string | undefined = undefined

	async putSession(record: SessionRecord): Promise<void> {
		this.sessions.set(record.id, record)
		this.#current = record.id
	}

	async latestSession(): Promise<SessionRecord | undefined> {
		return this.#current === undefined ? undefined : this.sessions.get(this.#current)
	}

	async deleteSession(id: string): Promise<void> {
		this.sessions.delete(id)
	}

	async putChunk(chunk: StoredChunk): Promise<void> {
		this.held.set(chunk.index, chunk)
	}

	async listChunks(): Promise<StoredChunk[]> {
		return [...this.held.values()].sort((left, right) => left.index - right.index)
	}

	async deleteChunks(): Promise<void> {
		this.held.clear()
	}
}

/** Fill a store with the recorded chunks, as a page that reloaded would. */
async function seededStore(): Promise<MemoryStore> {
	const store = new MemoryStore()
	await store.putSession({
		id: uploadId,
		url: base,
		owner: "owner-1",
		contentType: "audio/webm",
		visibility: "private",
		chunkSize,
		startedAt: 1
	})
	for (const [index, text] of goldenChunks.entries()) {
		const bytes = bytesOf(text)
		await store.putChunk({ id: uploadId, index, sha256: await sha256Hex(bytes), bytes: bytes.buffer })
	}
	return store
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("chunk splitting", () => {
	test("uneven capture blocks leave whole chunks and a short tail", () => {
		const buffer = new ChunkBuffer(chunkSize)
		expect(buffer.append(bytesOf("gold"))).toHaveLength(0)
		const first = buffer.append(bytesOf("en upload bytes."))
		expect(first).toHaveLength(2)
		expect(first[0].byteLength).toBe(chunkSize)
		expect(first[1].byteLength).toBe(chunkSize)
		expect(buffer.buffered).toBe(4)
		const tail = buffer.flush()
		expect(tail).not.toBeNull()
		expect(new TextDecoder().decode(tail as Uint8Array)).toBe("tes.")
	})

	test("a block that fills the buffer exactly leaves no tail", () => {
		const buffer = new ChunkBuffer(chunkSize)
		expect(buffer.append(bytesOf(goldenChunks.join("")))).toHaveLength(2)
		expect(buffer.flush()?.byteLength).toBe(4)
		expect(buffer.flush()).toBeNull()
	})

	test("every chunk is a private buffer the next append cannot reach", () => {
		const buffer = new ChunkBuffer(chunkSize)
		const [first] = buffer.append(bytesOf(goldenChunks.join("")))
		buffer.append(bytesOf("more"))
		expect(new TextDecoder().decode(first)).toBe(goldenChunks[0])
	})
})

describe("chunk digests", () => {
	test("the first chunk digests to the value the goldens record", async () => {
		expect(await sha256Hex(bytesOf(goldenChunks[0]))).toBe(goldenFirstDigest)
	})

	test("the whole capture digests to the value the goldens record", async () => {
		expect(await sha256Hex(goldenBytes())).toBe(goldenDigest)
	})
})

describe("retry policy", () => {
	test("the delay doubles from the base and stops at the ceiling", () => {
		expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([250, 500, 1000, 2000, 2000, 2000])
	})

	test("a busy or broken server is worth another attempt", () => {
		expect([408, 429, 500, 503].map(isRetryableStatus)).toEqual([true, true, true, true])
		expect([400, 404, 409, 413, 201].map(isRetryableStatus)).toEqual([false, false, false, false, false])
	})
})

describe("upload protocol", () => {
	test("the begin golden reads as an empty upload waiting for three chunks", () => {
		expect(parseUploadSnapshot(begin)).toEqual({
			ok: true,
			value: {
				id: uploadId,
				owner: "owner-1",
				contentType: "video/mp4",
				visibility: "private",
				chunkSize: 8,
				sizeBytes: 20,
				chunkCount: 3,
				storedBytes: 0,
				received: [],
				missing: [0, 1, 2],
				expiresAt: "2026-01-02T04:04:05Z"
			}
		})
	})

	test("the chunk golden reads the bytes it stored and the gap it left", () => {
		const parsed = parseUploadSnapshot(chunkAck)
		expect(parsed.ok).toBe(true)
		expect(parsed.ok ? parsed.value.storedBytes : 0).toBe(8)
		expect(parsed.ok ? parsed.value.received : []).toEqual([0])
		expect(parsed.ok ? parsed.value.missing : []).toEqual([1, 2])
	})

	test("the state golden reads chunks that arrived out of order", () => {
		const parsed = parseUploadSnapshot(uploadState)
		expect(parsed.ok ? parsed.value.received : []).toEqual([0, 2])
		expect(parsed.ok ? parsed.value.missing : []).toEqual([1])
	})

	test("the complete golden reads as a receipt with no expiry", () => {
		expect(parseUploadReceipt(completed)).toEqual({
			ok: true,
			value: {
				id: uploadId,
				owner: "owner-1",
				contentType: "video/mp4",
				visibility: "private",
				sizeBytes: 20,
				sha256: goldenDigest
			}
		})
	})

	test("an error body is not a state", () => {
		expect(parseUploadSnapshot(notFound).ok).toBe(false)
		expect(parseUploadReceipt(incomplete).ok).toBe(false)
	})

	test("a state without the accounting members is refused", () => {
		expect(parseUploadSnapshot('{"id":"x"}').ok).toBe(false)
		expect(parseUploadSnapshot("not json").ok).toBe(false)
	})
})

describe("refusals", () => {
	test("a conflict keeps the code and the missing list it reported", async () => {
		const failure = await refusal(new Response(incomplete, { status: 409 }))
		expect(failure.code).toBe("incomplete")
		expect(failure.detail).toEqual({ missing: [1] })
		expect(failure.retryable).toBe(false)
	})

	test("the status alone decides whether another attempt may answer", async () => {
		expect((await refusal(new Response(incomplete, { status: 503 }))).retryable).toBe(true)
		expect((await refusal(new Response(hashMismatch, { status: 409 }))).retryable).toBe(false)
	})

	test("a body without an envelope still reports the status", async () => {
		const failure = await refusal(new Response("not json", { status: 500 }))
		expect(failure.code).toBe("http")
		expect(failure.retryable).toBe(true)
	})
})

describe("streaming one capture", () => {
	test("the upload completes only after every chunk is acknowledged", async () => {
		const server = new UploadServer()
		vi.stubGlobal("fetch", server.handle)
		const store = new MemoryStore()
		const uploader = new ChunkUploader({ url: base, owner: "owner-1", contentType: "audio/webm", chunkSize, store })
		await uploader.start()
		for (const text of goldenChunks) uploader.append(bytesOf(text))
		await uploader.finish()
		expect(uploader.state).toBe("done")
		expect(uploader.acknowledged).toBe(goldenChunks.length)
		expect(uploader.stored).toBe(goldenBytes().byteLength)
		expect(uploader.receipt?.sha256).toBe(goldenDigest)
		expect(uploader.receipt?.sizeBytes).toBe(goldenBytes().byteLength)
		expect(server.completions).toBe(1)
		expect(server.premature).toBe(0)
		expect(server.chunks.size).toBe(goldenChunks.length)
		expect(server.paths.at(-1)).toBe(`POST /uploads/${uploadId}/complete`)
		expect(server.paths.at(-2)).toBe(`GET /uploads/${uploadId}`)
		expect(store.held.size).toBe(0)
	})

	test("a chunk that fails once is sent again and the upload completes", async () => {
		const server = new UploadServer()
		server.failures = 1
		vi.stubGlobal("fetch", server.handle)
		const uploader = new ChunkUploader({
			url: base,
			owner: "owner-1",
			contentType: "audio/webm",
			chunkSize,
			store: new MemoryStore()
		})
		await uploader.start()
		for (const text of goldenChunks) uploader.append(bytesOf(text))
		await uploader.finish()
		expect(uploader.retries).toBe(1)
		expect(uploader.state).toBe("done")
		expect(server.chunks.size).toBe(goldenChunks.length)
	})

	test("a chunk the server lost after acknowledging it is sent again", async () => {
		const server = new UploadServer()
		server.lostIndex = 1
		vi.stubGlobal("fetch", server.handle)
		const uploader = new ChunkUploader({
			url: base,
			owner: "owner-1",
			contentType: "audio/webm",
			chunkSize,
			store: new MemoryStore()
		})
		await uploader.start()
		for (const text of goldenChunks) uploader.append(bytesOf(text))
		await uploader.finish()
		expect(uploader.state).toBe("done")
		expect(uploader.receipt?.sha256).toBe(goldenDigest)
		expect(server.writes).toBe(goldenChunks.length + 1)
	})

	test("a refusal that no retry can answer stops the upload", async () => {
		const server = new UploadServer()
		server.mismatchIndex = 1
		vi.stubGlobal("fetch", server.handle)
		const uploader = new ChunkUploader({
			url: base,
			owner: "owner-1",
			contentType: "audio/webm",
			chunkSize,
			store: new MemoryStore()
		})
		await uploader.start()
		for (const text of goldenChunks) uploader.append(bytesOf(text))
		await uploader.finish()
		expect(uploader.state).toBe("failed")
		expect(uploader.error?.code).toBe("chunk_mismatch")
		expect(uploader.error?.retryable).toBe(false)
		expect(server.completions).toBe(0)
		expect(server.premature).toBe(0)
	})

	test("a reopened page sends only the chunks the server lacks", async () => {
		const server = new UploadServer()
		server.chunks.set(0, bytesOf(goldenChunks[0]))
		server.chunks.set(2, bytesOf(goldenChunks[2]))
		vi.stubGlobal("fetch", server.handle)
		const store = await seededStore()
		const uploader = await ChunkUploader.resume(store)
		expect(uploader).toBeDefined()
		const resumed = uploader as ChunkUploader
		expect(resumed.state).toBe("streaming")
		expect(resumed.acknowledged).toBe(2)
		expect(resumed.pending).toBe(1)
		await resumed.finish()
		expect(resumed.state).toBe("done")
		expect(resumed.receipt?.sha256).toBe(goldenDigest)
		expect(server.writes).toBe(1)
		expect(server.completions).toBe(1)
	})

	test("a block appended while the open is in flight streams once it answers", async () => {
		const server = new UploadServer()
		vi.stubGlobal("fetch", server.handle)
		const uploader = new ChunkUploader({ url: base, owner: "owner-1", contentType: "audio/webm", chunkSize, store: new MemoryStore() })
		const opening = uploader.start()
		uploader.append(bytesOf(goldenChunks[0]))
		await opening
		expect(uploader.state).toBe("streaming")
		expect(uploader.error).toBeUndefined()
		for (const text of goldenChunks.slice(1)) uploader.append(bytesOf(text))
		await uploader.finish()
		expect(uploader.state).toBe("done")
		expect(uploader.receipt?.sha256).toBe(goldenDigest)
		expect(server.writes).toBe(goldenChunks.length)
		expect(server.completions).toBe(1)
		expect(server.paths[0]).toBe(`POST /uploads`)
	})

	test("a second finish while one is in flight sends no second completion", async () => {
		const server = new UploadServer()
		vi.stubGlobal("fetch", server.handle)
		const uploader = new ChunkUploader({ url: base, owner: "owner-1", contentType: "audio/webm", chunkSize, store: new MemoryStore() })
		await uploader.start()
		for (const text of goldenChunks) uploader.append(bytesOf(text))
		await Promise.all([uploader.finish(), uploader.finish()])
		expect(uploader.state).toBe("done")
		expect(uploader.receipt?.sha256).toBe(goldenDigest)
		expect(server.completions).toBe(1)
	})

	test("nothing waits when the store holds no session", async () => {
		expect(await ChunkUploader.resume(new MemoryStore())).toBeUndefined()
	})
})
