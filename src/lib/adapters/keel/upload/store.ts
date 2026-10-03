import type { SessionRecord, StoredChunk, UploadStore } from "./types.js"

/** The database this module owns. */
const databaseName = "chaaya-upload"

/** Its schema version. */
const version = 1

/** The store holding one record per upload. */
const sessionStore = "sessions"

/** The store holding one record per chunk. */
const chunkStore = "chunks"

/**
 * The highest chunk index a read covers. Indices count up from zero, so this
 * bound reaches every one of them.
 */
const lastIndex = Number.MAX_SAFE_INTEGER

function openDatabase(): Promise<IDBDatabase> {
	const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>()
	const request = indexedDB.open(databaseName, version)
	request.onupgradeneeded = () => {
		const database = request.result
		if (!database.objectStoreNames.contains(sessionStore)) {
			database.createObjectStore(sessionStore, { keyPath: "id" })
		}
		if (!database.objectStoreNames.contains(chunkStore)) {
			database.createObjectStore(chunkStore, { keyPath: ["id", "index"] })
		}
	}
	request.onsuccess = () => resolve(request.result)
	request.onerror = () => reject(request.error ?? new Error("the upload database did not open"))
	return promise
}

/** Await one request, and reject when the database refuses it. */
function settled<T>(request: IDBRequest<T>): Promise<T> {
	const { promise, resolve, reject } = Promise.withResolvers<T>()
	request.onsuccess = () => resolve(request.result)
	request.onerror = () =>
		reject(request.error ?? new Error("the upload database refused the request"))
	return promise
}

/**
 * Keeps pending uploads in IndexedDB, so a reloaded page resumes them.
 *
 * Construction opens nothing, because a server import must stay safe. The
 * first call opens the database and builds its stores.
 */
export class IndexedDbStore implements UploadStore {
	#database: Promise<IDBDatabase> | undefined = undefined

	#open(): Promise<IDBDatabase> {
		this.#database ??= openDatabase()
		return this.#database
	}

	/** Run one transaction over one store and await its request. */
	async #run<T>(
		store: string,
		mode: IDBTransactionMode,
		request: (object: IDBObjectStore) => IDBRequest<T>
	): Promise<T> {
		const database = await this.#open()
		const transaction = database.transaction(store, mode)
		return await settled(request(transaction.objectStore(store)))
	}

	/** The key range covering every chunk of one upload. */
	#chunksOf(id: string): IDBKeyRange {
		return IDBKeyRange.bound([id, 0], [id, lastIndex])
	}

	async putSession(record: SessionRecord): Promise<void> {
		await this.#run(sessionStore, "readwrite", (store) => store.put(record))
	}

	async latestSession(): Promise<SessionRecord | undefined> {
		const records = await this.#run<SessionRecord[]>(sessionStore, "readonly", (store) =>
			store.getAll()
		)
		let newest: SessionRecord | undefined = undefined
		for (const record of records) {
			if (newest === undefined || record.startedAt > newest.startedAt) newest = record
		}
		return newest
	}

	async deleteSession(id: string): Promise<void> {
		await this.#run(sessionStore, "readwrite", (store) => store.delete(id))
	}

	async putChunk(chunk: StoredChunk): Promise<void> {
		await this.#run(chunkStore, "readwrite", (store) => store.put(chunk))
	}

	async listChunks(id: string): Promise<StoredChunk[]> {
		const records = await this.#run<StoredChunk[]>(chunkStore, "readonly", (store) =>
			store.getAll(this.#chunksOf(id))
		)
		records.sort((left, right) => left.index - right.index)
		return records
	}

	async deleteChunks(id: string): Promise<void> {
		await this.#run(chunkStore, "readwrite", (store) => store.delete(this.#chunksOf(id)))
	}
}
