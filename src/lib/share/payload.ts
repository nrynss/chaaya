/**
 * One normalised share. Every field is optional, because some senders carry
 * only a title. At least one field is present, or there is no payload.
 */
export interface SharedPayload {
	/** The shared link, pulled from the text when the sender put it there. */
	readonly url?: string
	/** The shared words, as the sender wrote them. */
	readonly text?: string
	/** The shared title, when the sender named one. */
	readonly title?: string
}

/** Trim a query param of a shared link. Return true to drop it. */
export type TrackParamFilter = (name: string, value: string) => boolean

/** What `readSharedPayload` needs. */
export interface ReadShareOptions {
	/** Trim a query param of the shared link when this answers true. Omit to keep every param. */
	readonly dropParam?: TrackParamFilter
}

/** A link starts here and runs to the next space or bracket. */
const LINK_PATTERN = /https?:\/\/[^\s<>"'()\]\\]+/g

/** Trailing stops the sender never meant as part of the link. */
const TRAILING_STOPS = /[.,;:!?]+$/u

/**
 * The first link inside free text, or undefined when there is none. Keeps
 * encoded characters as they are, because decoding belongs to the URL read.
 */
export function extractFirstUrl(text: string): string | undefined {
	LINK_PATTERN.lastIndex = 0
	const match = LINK_PATTERN.exec(text)
	if (!match) return undefined
	return match[0].replace(TRAILING_STOPS, "")
}

/** A query value with whitespace trimmed, or undefined when it carries nothing. */
function clean(value: string | null): string | undefined {
	if (value === null) return undefined
	const trimmed = value.trim()
	return trimmed === "" ? undefined : trimmed
}

/** The shared link with tracking params trimmed through the caller filter. */
function tidyUrl(raw: string, dropParam: TrackParamFilter | undefined): string {
	try {
		const parsed = new URL(raw)
		if (dropParam !== undefined) {
			for (const [name, value] of [...parsed.searchParams]) {
				let drop: boolean
				try {
					drop = dropParam(name, value)
				} catch {
					drop = false
				}
				if (drop) parsed.searchParams.delete(name, value)
			}
		}
		return parsed.toString()
	} catch {
		return raw.trim()
	}
}

/**
 * Normalise a launch URL into one payload. Reads title, text, and url params.
 * When url is missing, pulls the first link out of text. Trims link params
 * the caller filter refuses. Answers undefined when all three are empty.
 */
export function readSharedPayload(source: URL | string, options: ReadShareOptions = {}): SharedPayload | undefined {
	const url = typeof source === "string" ? new URL(source) : source
	const title = clean(url.searchParams.get("title"))
	const text = clean(url.searchParams.get("text"))
	const direct = clean(url.searchParams.get("url"))
	const found = direct ?? (text !== undefined ? extractFirstUrl(text) : undefined)
	const link = found === undefined ? undefined : tidyUrl(found, options.dropParam)
	if (title === undefined && text === undefined && link === undefined) return undefined
	const payload: { url?: string; text?: string; title?: string } = {}
	if (link !== undefined) payload.url = link
	if (text !== undefined) payload.text = text
	if (title !== undefined) payload.title = title
	return payload
}

/** A share handler. One handler serves the web share and a native intent. */
export type ShareHandler = (payload: SharedPayload) => void

/**
 * One native intake seam. A native shell emits through `emit`, and app code
 * subscribes once, beside the web launch read. Both carry `SharedPayload`.
 */
export interface ShareSource {
	/** Listen for native shares. The returned function unsubscribes. */
	subscribe(handler: ShareHandler): () => void
}

/** A testable native seam. The app wires a real shell where this is a stub. */
export function createShareSource(): { source: ShareSource; emit(payload: SharedPayload): void } {
	const handlers = new Set<ShareHandler>()
	return {
		source: {
			subscribe(handler: ShareHandler): () => void {
				handlers.add(handler)
				return () => {
					handlers.delete(handler)
				}
			}
		},
		emit(payload: SharedPayload): void {
			for (const handler of [...handlers]) handler(payload)
		}
	}
}
