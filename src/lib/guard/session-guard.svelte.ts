/**
 * The largest close body the guard sends, in bytes. The fetch standard gives
 * the keepalive bodies a page has in flight one shared budget of 64 KiB. A
 * browser that enforces it refuses a request that would pass it, and some
 * browsers enforce it on a beacon too. So the guard applies one cap on every
 * path.
 */
const MAX_BODY_BYTES = 64 * 1024

/**
 * The bodies a close can carry. The guard measures each one exactly before
 * the send, so the cap holds on the wire. A FormData is left out, because
 * the browser adds multipart framing the guard cannot measure before the
 * send. A stream is left out, because neither path sends one on unload.
 */
type CloseBody = string | Blob | BufferSource | URLSearchParams

/** What the guard needs to close one live session. */
export interface SessionGuardOptions {
	/** The endpoint that receives the close notice. */
	readonly url: string
	/**
	 * The body the close carries, read when the close goes. The guard calls it
	 * once per close, never at construction or attach(), so the close carries
	 * a value learned after attach(). A function that throws costs the body,
	 * never the close attempt. Leave it out to send no body.
	 *
	 * The body is a string, a Blob, a buffer or a URLSearchParams, and it may
	 * come from another frame. The guard sends a body of 64 KiB or less. It
	 * drops a larger body and sends the close bare, so the browser has no
	 * oversized body to refuse. It sends any other value from untyped code
	 * bare too, such as a FormData or a stream. A buffer that can resize or
	 * is shared goes as a fixed copy of its bytes, because a browser may
	 * refuse one as it is.
	 *
	 * A buffer, or a Blob with no type, goes with no Content-Type header. Some
	 * servers read such a body as empty, and SvelteKit's Node reader is one of
	 * them. Send a string, or a Blob with a type, when the endpoint needs one.
	 *
	 * The guard makes exactly one close attempt, by beacon or by keepalive
	 * request, and it cannot promise delivery. The browser may refuse that
	 * attempt when its keepalive limits are spent. The page shares one byte
	 * budget across every keepalive request in flight, and a body adds to it.
	 * Some browsers also cap how many keepalive requests are in flight. Beacon
	 * limits differ between browsers. The guard cannot see the page's other
	 * requests, so keep the body small.
	 */
	readonly body?: () => string | Blob | BufferSource | URLSearchParams | null
}

/**
 * Closes one live session when its page goes away.
 *
 * A page that holds a session builds one guard, calls attach() after it
 * mounts, and calls destroy() when it is destroyed. The guard sends its
 * close on pagehide and on destroy. A latch keeps the first send while
 * later ones do nothing, so the pair makes exactly one close attempt.
 *
 * Building a guard touches no browser global. Only attach(), close() and
 * destroy() reach the window, so a server render may build one freely.
 */
export class SessionGuard {
	/** True once the close notice has gone. */
	closed = $state(false)

	readonly #url: string
	readonly #body: (() => CloseBody | null) | undefined
	#onHide: (() => void) | null = null

	constructor(options: SessionGuardOptions) {
		this.#url = options.url
		this.#body = options.body
	}

	/**
	 * Listen for the page going away. Call after mount, so no server render
	 * touches the window. A second call does nothing.
	 */
	attach(): void {
		if (this.#onHide !== null) return
		const onHide = () => this.close()
		this.#onHide = onHide
		window.addEventListener("pagehide", onHide)
	}

	/**
	 * Tell the server the session is leaving. The first call makes the one
	 * close attempt, and every later call does nothing. The attempt goes by
	 * beacon when the browser offers one and takes it, and by a keepalive
	 * request otherwise, so it can outlive the page. Either path carries the
	 * one body this close read.
	 */
	close(): void {
		if (this.closed) return
		this.closed = true
		const body = this.#readBody()
		if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
			try {
				const sent = body === null ? navigator.sendBeacon(this.#url) : navigator.sendBeacon(this.#url, body)
				if (sent) return
			} catch {
				// Fall through to the keepalive request below.
			}
		}
		const init: RequestInit = { method: "POST", keepalive: true }
		if (body !== null) init.body = body
		void fetch(this.#url, init).catch(() => {
			// The page is leaving, so a failed close has nowhere to report.
		})
	}

	/**
	 * Read the close body once. A missing option and a throwing function both
	 * give null, so the close attempt still goes. The page is leaving, so a
	 * throw has nowhere to report. A value the guard cannot measure or copy,
	 * or one over the cap, also gives null, because a refused body takes the
	 * close with it.
	 */
	#readBody(): CloseBody | null {
		if (this.#body === undefined) return null
		try {
			return wireBody(this.#body())
		} catch {
			return null
		}
	}

	/**
	 * Stop listening, and send the close when it has not gone. Call on
	 * destroy, so a navigation that never fired pagehide still closes.
	 */
	destroy(): void {
		if (this.#onHide !== null) {
			window.removeEventListener("pagehide", this.#onHide)
			this.#onHide = null
		}
		this.close()
	}
}

/** The getter a prototype defines for a key, or undefined when this engine lacks it. */
function getterOf(prototype: object, key: string): (() => unknown) | undefined {
	return Object.getOwnPropertyDescriptor(prototype, key)?.get
}

/**
 * The getter a prototype defines for a key. Every engine that runs this
 * module defines these, but an absent one reads as a getter that throws, so
 * the brand check fails rather than the import.
 */
function slotGetter<T>(prototype: object, key: string): () => T {
	return (getterOf(prototype, key) ?? missing) as () => T
}

/** Stands in for a getter the engine lacks. */
function missing(): never {
	throw new TypeError("This engine lacks the getter.")
}

/*
 * The getters that read a buffer's or a view's internal slots. They come
 * from JavaScript's own prototypes, never from a browser global, so reading
 * them here is safe on the server. Each is called on the value itself, so
 * an own property on the value cannot shadow the fact it reads.
 */
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object
const bufferLength = slotGetter<number>(ArrayBuffer.prototype, "byteLength")
const bufferResizable = getterOf(ArrayBuffer.prototype, "resizable")
const typedLength = slotGetter<number>(typedArrayPrototype, "byteLength")
const typedOffset = slotGetter<number>(typedArrayPrototype, "byteOffset")
const typedBuffer = slotGetter<ArrayBufferLike>(typedArrayPrototype, "buffer")
const dataViewLength = slotGetter<number>(DataView.prototype, "byteLength")
const dataViewOffset = slotGetter<number>(DataView.prototype, "byteOffset")
const dataViewBuffer = slotGetter<ArrayBufferLike>(DataView.prototype, "buffer")
const DataViewOf = DataView

/**
 * The body a close sends for a value, or null when it must go bare. A value
 * goes bare when it is over the cap. It also goes bare when the guard cannot
 * know its size on the wire before the send, as with a FormData or a stream.
 *
 * No test compares a constructor or reads a tag, so a value from another
 * frame's realm passes as well as one from this realm. Every fact the guard
 * relies on comes from a built-in getter or method that reads an internal
 * slot. An own property on the value cannot shadow one, and a forgery with
 * no slot makes the read throw, so it goes bare.
 */
function wireBody(body: unknown): CloseBody | null {
	if (typeof body === "string") return fits(utf8Length(body)) ? body : null
	const blobSize = sizeOfBlob(body)
	if (blobSize !== null) return fits(blobSize) ? (body as Blob) : null
	const params = textOfParams(body)
	if (params !== null) return fits(utf8Length(params)) ? (body as URLSearchParams) : null
	const view = viewOf(body)
	if (view !== null) {
		if (!fits(view.length)) return null
		return isFixedArrayBuffer(view.buffer) ? (body as ArrayBufferView<ArrayBuffer>) : copyBytes(view.buffer, view.offset, view.length)
	}
	const fixed = lengthOfFixedBuffer(body)
	if (fixed !== null) return fits(fixed) ? (body as ArrayBuffer) : null
	const length = lengthOfOtherBuffer(body)
	if (length !== null) return fits(length) ? copyBytes(body as ArrayBufferLike, 0, length) : null
	return null
}

/** Whether a body of this many bytes fits the cap. */
function fits(bytes: number): boolean {
	return bytes <= MAX_BODY_BYTES
}

/** The UTF-8 length of a string, which is what both paths send. */
function utf8Length(text: string): number {
	return new TextEncoder().encode(text).byteLength
}

/**
 * Call a getter or method from a prototype on a value. The call throws when
 * the value lacks the slot the member reads, so it doubles as a brand check.
 */
function brand<T>(read: (() => T) | undefined, value: unknown): T | null {
	if (read === undefined || typeof value !== "object" || value === null) return null
	try {
		return read.call(value)
	} catch {
		return null
	}
}

/** The size of a Blob or a File, or null for any other value. */
function sizeOfBlob(value: unknown): number | null {
	if (typeof Blob === "undefined") return null
	return brand(getterOf(Blob.prototype, "size") as (() => number) | undefined, value)
}

/** The text a URLSearchParams sends, or null for any other value. */
function textOfParams(value: unknown): string | null {
	if (typeof URLSearchParams === "undefined") return null
	return brand(URLSearchParams.prototype.toString as () => string, value)
}

/** The bytes a view covers, read from its slots. */
interface ViewBytes {
	readonly buffer: ArrayBufferLike
	readonly offset: number
	readonly length: number
}

/**
 * The buffer, offset and length of a typed array or a DataView, or null for
 * any other value. A DataView whose buffer has shrunk under it also gives
 * null, because its getters throw.
 */
function viewOf(value: unknown): ViewBytes | null {
	const typed = brand(typedLength, value)
	if (typed !== null) return { buffer: typedBuffer.call(value), offset: typedOffset.call(value), length: typed }
	const viewLength = brand(dataViewLength, value)
	if (viewLength === null) return null
	return { buffer: dataViewBuffer.call(value), offset: dataViewOffset.call(value), length: viewLength }
}

/**
 * The length of an ArrayBuffer of fixed length, or null for any other value.
 * Browsers send that kind as it is. A browser refuses a resizable one, and
 * may refuse a shared one. An engine with no resizable getter has no
 * resizable buffers, so every ArrayBuffer there is fixed.
 */
function lengthOfFixedBuffer(value: unknown): number | null {
	const length = brand(bufferLength, value)
	if (length === null) return null
	return brand(bufferResizable, value) === true ? null : length
}

/** Whether a value is an ArrayBuffer of fixed length. */
function isFixedArrayBuffer(value: unknown): value is ArrayBuffer {
	return lengthOfFixedBuffer(value) !== null
}

/**
 * The length of a resizable ArrayBuffer or of a SharedArrayBuffer, growable
 * or not, or null for any other value. A page that is not cross-origin
 * isolated has no SharedArrayBuffer global, yet may hold a shared buffer
 * from a frame or a shared memory. A DataView builds on any real buffer, so
 * building one names the kind without that global, and its length getter
 * reads the buffer's current length from the slot.
 */
function lengthOfOtherBuffer(value: unknown): number | null {
	const arrayLength = brand(bufferLength, value)
	if (arrayLength !== null) return arrayLength
	if (typeof value !== "object" || value === null) return null
	try {
		return dataViewLength.call(new DataViewOf(value as ArrayBufferLike))
	} catch {
		return null
	}
}

/**
 * Copy bytes into a fresh ArrayBuffer of fixed length, which browsers send
 * as it is. The copy is exactly the bytes the source holds at send time.
 * Every caller passes a buffer a slot read has already confirmed, so the
 * typed array keeps that buffer and never treats it as an array-like.
 */
function copyBytes(source: ArrayBufferLike, offset: number, length: number): ArrayBuffer {
	const copy = new ArrayBuffer(length)
	new Uint8Array(copy).set(new Uint8Array(source, offset, length))
	return copy
}
