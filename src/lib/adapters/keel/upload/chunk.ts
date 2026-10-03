/** The longest chunk an upload sends when a caller names none. */
export const defaultChunkSize = 65536

/** The lowercase hex of one digest. */
function toHex(digest: ArrayBuffer): string {
	let text = ""
	for (const byte of new Uint8Array(digest)) text += byte.toString(16).padStart(2, "0")
	return text
}

/** The lowercase hex SHA-256 of one block of bytes, from Web Crypto. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
	return toHex(await crypto.subtle.digest("SHA-256", bytes))
}

/**
 * Splits a capture into chunks of one fixed size.
 *
 * A capture hands over uneven blocks, and the protocol wants no chunk longer
 * than the size the upload declared. This buffer keeps whatever a block left
 * over, so a chunk boundary never follows a capture block boundary. flush()
 * releases the short tail, because the last chunk of a capture is short.
 */
export class ChunkBuffer {
	readonly #size: number
	#buffer: Uint8Array<ArrayBuffer>
	#length = 0

	constructor(size: number) {
		this.#size = size
		this.#buffer = new Uint8Array(size)
	}

	/** How many bytes wait for the next chunk boundary. */
	get buffered(): number {
		return this.#length
	}

	/** Add one block and return every whole chunk it completed. */
	append(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] {
		const chunks: Uint8Array<ArrayBuffer>[] = []
		let offset = 0
		while (offset < bytes.byteLength) {
			const room = this.#size - this.#length
			const take = Math.min(room, bytes.byteLength - offset)
			this.#buffer.set(bytes.subarray(offset, offset + take), this.#length)
			this.#length += take
			offset += take
			if (this.#length === this.#size) {
				chunks.push(this.#buffer)
				this.#buffer = new Uint8Array(this.#size)
				this.#length = 0
			}
		}
		return chunks
	}

	/** Release the bytes below one chunk size, or null when none wait. */
	flush(): Uint8Array<ArrayBuffer> | null {
		if (this.#length === 0) return null
		const tail = this.#buffer.subarray(0, this.#length)
		this.#buffer = new Uint8Array(this.#size)
		this.#length = 0
		return tail
	}
}
