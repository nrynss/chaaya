import { ChunkBuffer, defaultChunkSize, sha256Hex } from "./chunk.js"
import {
	beginBody,
	chunkPath,
	completeBody,
	completePath,
	parseUploadReceipt,
	parseUploadSnapshot,
	refusal,
	toUploadFailure,
	UploadFailure,
	uploadPath
} from "./protocol.js"
import { retryDelayMs, retryMaxAttempts } from "./retry.js"
import { IndexedDbStore } from "./store.js"
import type {
	SessionRecord,
	StoredChunk,
	UploadChunk,
	UploadError,
	UploadOptions,
	UploadReceipt,
	UploadSnapshot,
	UploadState,
	UploadStore
} from "./types.js"

/** How long the drain waits before it looks for work again. */
const idlePollMs = 20

function wait(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>()
	setTimeout(resolve, ms)
	return promise
}

/**
 * Streams one capture to the upload protocol.
 *
 * A caller opens the upload, hands every captured block to append(), and calls
 * finish() when the capture stops. The uploader splits the capture into fixed
 * size chunks, hashes each chunk with Web Crypto, persists it, and streams it
 * to the server. A failed chunk retries with backoff. The upload stays pending
 * in IndexedDB until every chunk is acknowledged, so a reloaded page resumes
 * with resume().
 *
 * start() and finish() resolve when their work ends, and the state reports the
 * outcome. A caller reads state, error and receipt instead of catching.
 */
export class ChunkUploader {
	/** Where the upload stands. */
	state = $state<UploadState>("idle")
	/** The id the server gave the upload, once it opened. */
	id = $state<string | undefined>(undefined)
	/** How many bytes the capture has handed over. */
	capturedBytes = $state(0)
	/** How many chunks the server has acknowledged. */
	acknowledged = $state(0)
	/** How many chunks wait for a send. */
	pending = $state(0)
	/** How many failed attempts will run again. */
	retries = $state(0)
	/** How many bytes the server holds. */
	stored = $state(0)
	/** What a finished upload reported. */
	receipt = $state<UploadReceipt | undefined>(undefined)
	/** Why the upload stopped, when it failed. */
	error = $state<UploadError | undefined>(undefined)

	readonly #options: UploadOptions
	readonly #store: UploadStore
	readonly #buffer: ChunkBuffer
	#queue: UploadChunk[] = []
	#nextIndex = 0
	#storing: Promise<void> = Promise.resolve()
	#failure: UploadFailure | undefined = undefined
	#running: Promise<void> | undefined = undefined
	#frozen = false

	constructor(options: UploadOptions) {
		this.#options = options
		this.#store = options.store ?? new IndexedDbStore()
		this.#buffer = new ChunkBuffer(options.chunkSize ?? defaultChunkSize)
	}

	/**
	 * Open the upload on the server and record it, so a reloaded page finds
	 * it. The open is not retried, because nothing has been sent yet and the
	 * caller can open again.
	 */
	async start(): Promise<void> {
		if (this.state !== "idle") return
		this.state = "opening"
		const options = this.#options
		const chunkSize = options.chunkSize ?? defaultChunkSize
		const visibility = options.visibility ?? "private"
		try {
			const response = await fetch(options.url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: beginBody({ owner: options.owner, contentType: options.contentType, visibility, chunkSize })
			})
			if (!response.ok) throw await refusal(response)
			const parsed = parseUploadSnapshot(await response.text())
			if (!parsed.ok) throw new UploadFailure("invalid_response", parsed.failure.message)
			this.id = parsed.value.id
			this.stored = parsed.value.storedBytes
			await this.#store.putSession({
				id: parsed.value.id,
				url: options.url,
				owner: options.owner,
				contentType: options.contentType,
				visibility,
				chunkSize,
				startedAt: Date.now()
			})
			this.state = "streaming"
		} catch (error) {
			this.#fail(toUploadFailure(error))
		}
	}

	/**
	 * Hand one captured block to the upload. The chunker splits it, and every
	 * chunk persists before it is sent. A block that arrives after finish() is
	 * ignored.
	 */
	append(bytes: Uint8Array<ArrayBuffer>): void {
		if (this.#frozen || this.#failure !== undefined)
			return
		this.capturedBytes += bytes.byteLength
		for (const chunk of this.#buffer.append(bytes)) this.#accept(chunk)
	}

	/**
	 * Stop taking capture and complete the upload.
	 *
	 * It releases the short tail as the last chunk, waits until the server
	 * acknowledges every chunk it holds, and only then sends the completion.
	 * The whole file digest comes from the stored chunks, so a resumed page
	 * completes with exactly the bytes it recovered.
	 */
	async finish(): Promise<void> {
		if (this.state === "done" || this.state === "failed") return
		this.#frozen = true
		this.state = "finishing"
		const tail = this.#buffer.flush()
		if (tail !== null) this.#accept(tail)
		await this.#storing
		await this.#settle()
		if (this.#failure !== undefined) return
		await this.#complete()
	}

	/**
	 * Pick up the newest upload a page left behind. It reads the stored
	 * session, asks the server what it already holds, and queues the chunks
	 * that are still missing. It returns undefined when nothing waits.
	 *
	 * A reloaded page lost its capture stream, so it finishes what it
	 * recovered. The caller decides that by calling finish().
	 */
	static async resume(store: UploadStore = new IndexedDbStore()): Promise<ChunkUploader | undefined> {
		const record = await store.latestSession()
		if (record === undefined) return undefined
		const uploader = new ChunkUploader({
			url: record.url,
			owner: record.owner,
			contentType: record.contentType,
			visibility: record.visibility === "public" ? "public" : "private",
			chunkSize: record.chunkSize,
			store
		})
		await uploader.#adopt(record)
		return uploader
	}

	/** Take over one recorded session. */
	async #adopt(record: SessionRecord): Promise<void> {
		this.id = record.id
		this.state = "streaming"
		try {
			const stored = await this.#store.listChunks(record.id)
			for (const chunk of stored) {
				this.capturedBytes += chunk.bytes.byteLength
				this.#queue.push({ index: chunk.index, bytes: new Uint8Array(chunk.bytes), sha256: chunk.sha256 })
			}
			const last = stored.at(-1)
			if (last !== undefined) this.#nextIndex = last.index + 1
			this.pending = this.#queue.length
			const state = await this.#attempt(() => this.#readState())
			const held = new Set(state.received)
			this.#queue = this.#queue.filter((chunk) => !held.has(chunk.index))
			this.acknowledged = held.size
			this.stored = state.storedBytes
			this.pending = this.#queue.length
			this.#kick()
		} catch (error) {
			this.#fail(toUploadFailure(error))
		}
	}

	/** Hash, persist and queue one chunk. Every chunk reaches the store, so a
	 * chunk the server lost is always readable here. */
	#accept(bytes: Uint8Array<ArrayBuffer>): void {
		const id = this.id
		if (id === undefined) {
			this.#fail(new UploadFailure("not_open", "the upload has not opened"))
			return
		}
		const index = this.#nextIndex
		this.#nextIndex += 1
		this.#storing = this.#storing
			.then(async () => {
				const sha256 = await sha256Hex(bytes)
				await this.#store.putChunk({ id, index, sha256, bytes: bytes.slice().buffer })
				this.#queue.push({ index, bytes, sha256 })
				this.pending = this.#queue.length
				this.#kick()
			})
			.catch((error: unknown) => {
				this.#fail(new UploadFailure("store", error instanceof Error ? error.message : String(error)))
			})
	}

	/** Start the drain, and restart it when the release of the last drain
	 * raced an enqueue. */
	#kick(): void {
		if (this.#running !== undefined) return
		const running = this.#pump()
		this.#running = running
		void running.finally(() => {
			this.#running = undefined
			if (this.#queue.length > 0 && this.#failure === undefined) this.#kick()
		})
	}

	/** Send queued chunks in index order until none wait or one fails. */
	async #pump(): Promise<void> {
		while (this.#failure === undefined && this.#queue.length > 0) {
			const chunk = this.#queue[0]
			try {
				await this.#send(chunk)
			} catch (error) {
				this.#fail(toUploadFailure(error))
				return
			}
			this.#queue.shift()
			this.acknowledged += 1
			this.pending = this.#queue.length
		}
	}

	/** Wait until every queued chunk is acknowledged. */
	async #settle(): Promise<void> {
		for (;;) {
			if (this.#failure !== undefined) return
			if (this.#running === undefined && this.#queue.length === 0) return
			const running = this.#running
			await (running ?? wait(idlePollMs))
		}
	}

	/** Send one chunk and read the server's accounting from the answer. */
	async #send(chunk: UploadChunk): Promise<void> {
		const body = await this.#attempt(() => this.#put(chunk))
		const parsed = parseUploadSnapshot(body)
		if (parsed.ok) this.stored = parsed.value.storedBytes
	}

	/** Run one request, and retry it while a retry can answer it. */
	async #attempt<T>(run: () => Promise<T>): Promise<T> {
		let attempt = 0
		for (;;) {
			try {
				return await run()
			} catch (error) {
				const failure = toUploadFailure(error)
				attempt += 1
				if (!failure.retryable || attempt >= retryMaxAttempts) throw failure
				this.retries += 1
				await wait(retryDelayMs(attempt))
			}
		}
	}

	/** Write one chunk. The digest travels beside the bytes, so the server can
	 * refuse a chunk that arrived damaged. */
	async #put(chunk: UploadChunk): Promise<string> {
		const response = await fetch(chunkPath(this.#options.url, this.#openId(), chunk.index), {
			method: "PUT",
			headers: { "content-type": "application/octet-stream", "x-chunk-sha256": chunk.sha256 },
			body: chunk.bytes
		})
		if (!response.ok) throw await refusal(response)
		return await response.text()
	}

	/** Read what the server holds for this upload. */
	async #readState(): Promise<UploadSnapshot> {
		const response = await fetch(uploadPath(this.#options.url, this.#openId()))
		if (!response.ok) throw await refusal(response)
		const parsed = parseUploadSnapshot(await response.text())
		if (!parsed.ok) throw new UploadFailure("invalid_response", parsed.failure.message)
		return parsed.value
	}

	/**
	 * Send the chunks the server says it lacks, put back in index order. Every
	 * chunk was persisted before it was sent, so a chunk the server lost is
	 * still readable here.
	 */
	async #resend(missing: readonly number[]): Promise<void> {
		if (missing.length === 0) return
		const stored = new Map(
			(await this.#store.listChunks(this.#openId())).map((chunk: StoredChunk) => [chunk.index, chunk])
		)
		for (const index of missing) {
			const chunk = stored.get(index)
			if (chunk === undefined) continue
			this.#queue.push({ index, bytes: new Uint8Array(chunk.bytes), sha256: chunk.sha256 })
		}
		this.pending = this.#queue.length
		this.#kick()
	}

	/**
	 * Complete the upload, and only once the server holds every chunk.
	 *
	 * It reads the state, re-sends anything missing, waits for every
	 * acknowledgement, and digests the stored chunks. A completion sent early
	 * would fail, because the server assembles only a complete upload.
	 */
	async #complete(): Promise<void> {
		try {
			const state = await this.#attempt(() => this.#readState())
			await this.#resend(state.missing)
			await this.#settle()
			if (this.#failure !== undefined) return
			const sha256 = await this.#wholeDigest()
			const body = await this.#attempt(async () => {
				const response = await fetch(completePath(this.#options.url, this.#openId()), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: completeBody(sha256)
				})
				if (!response.ok) throw await refusal(response)
				return await response.text()
			})
			const parsed = parseUploadReceipt(body)
			if (!parsed.ok) throw new UploadFailure("invalid_response", parsed.failure.message)
			this.receipt = parsed.value
			this.state = "done"
			await this.#store.deleteChunks(parsed.value.id)
			await this.#store.deleteSession(parsed.value.id)
		} catch (error) {
			this.#fail(toUploadFailure(error))
		}
	}

	/**
	 * The lowercase hex SHA-256 of every stored chunk in index order. The
	 * digest covers exactly the bytes the capture handed over, so it matches
	 * the blob a page saved.
	 *
	 * Web Crypto digests one buffer at a time and exposes no streaming digest,
	 * so this assembles the upload once. A voice recording is small, and the
	 * assembly is nothing beside the encoding cost.
	 */
	async #wholeDigest(): Promise<string> {
		const chunks = await this.#store.listChunks(this.#openId())
		let size = 0
		for (const chunk of chunks) size += chunk.bytes.byteLength
		const all = new Uint8Array(size)
		let offset = 0
		for (const chunk of chunks) {
			all.set(new Uint8Array(chunk.bytes), offset)
			offset += chunk.bytes.byteLength
		}
		return await sha256Hex(all)
	}

	/** The server's id for this upload, or a failure when none arrived. */
	#openId(): string {
		const id = this.id
		if (id === undefined) throw new UploadFailure("not_open", "the upload has not opened")
		return id
	}

	/** Record the first failure and stop the upload. */
	#fail(failure: UploadFailure): void {
		if (this.#failure !== undefined) return
		this.#failure = failure
		this.error =
			failure.detail === undefined
				? { code: failure.code, message: failure.message, retryable: failure.retryable }
				: {
						code: failure.code,
						message: failure.message,
						detail: failure.detail,
						retryable: failure.retryable
					}
		this.state = "failed"
	}
}
