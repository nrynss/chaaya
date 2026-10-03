import type { NamedEvent, SseFrame } from "./frame.js"
import { FrameLoop, isReplayId } from "./loop.svelte.js"
import type { FrameDecision, StreamConnection } from "./loop.svelte.js"
import type { ReconnectOptions } from "./reconnect.js"

/** Where one event stream stands. Same states as the shared loop. */
export type EventConnection = StreamConnection

/** What createEventStream needs. Event names are the caller's. Nothing here reads a job frame. */
export interface EventStreamOptions {
	/** Extra headers. Accept is always text/event-stream. Merged over `requestInit` headers. */
	headers?: HeadersInit
	/** Extra fetch fields. `headers` and `credentials` carry auth. `accept` does not stick. `signal` is ignored. */
	requestInit?: RequestInit
	/** Event names to keep. Omit to keep every named event. A plain array, so `includes` does not walk the prototype. */
	events?: readonly string[]
	/** Event names that end the stream. The first one closes it. */
	terminal?: readonly string[]
	/** Read events the stream may have missed. It runs once per open connection. */
	catchUp?: () => Promise<readonly NamedEvent[] | void>
	/** Run for each accepted event. Comment frames do not call it. */
	onFrame?: (event: NamedEvent) => void
	/** Run when a comment frame arrives, including a heartbeat. The payload is the comment text. */
	onComment?: (comment: string) => void
	/** Run when a dropped stream opens again. It receives the new count. */
	onReconnect?: (count: number) => void
	/** The reconnect schedule. Omit for the shared default. */
	reconnect?: ReconnectOptions
}

/** A live named-event stream. */
export interface EventStream {
	readonly connection: EventConnection
	readonly reconnects: number
	readonly events: NamedEvent[]
	readonly lastEventId: number
	/** Epoch milliseconds of the last comment frame. Undefined until one arrives. */
	readonly lastComment: number | undefined
	/** Adopt events captured before this view existed. Call it before attach(). */
	prime(events: readonly NamedEvent[]): void
	/** Follow the stream. A test passes its own cleanup runner. */
	attach(registerCleanup?: (task: () => () => void) => void): void
	/** Stop following. A second call changes nothing. */
	close(): void
}

/** Events captured before the page that renders them exists.
 * This is not a product topic. It is a list of frames. */
export class FrameBuffer {
	readonly events: NamedEvent[] = []

	push(event: NamedEvent): void {
		this.events.push(event)
	}

	drain(): NamedEvent[] {
		const copy = this.events.slice()
		this.events.length = 0
		return copy
	}
}

/**
 * Follow one named-event stream.
 *
 * This is not a job client. It does not read a job id, a stage, or a fixed
 * set of event names. The fetch loop is `FrameLoop` in core. This function
 * only decides which names to keep.
 *
 * Transport: named SSE over `fetch`. This is not `EventSource`. The browser
 * event source hides a refused status and uses its own retry. There is no
 * WebSocket path.
 *
 * Last-Event-ID matches the job stream. The first connect does not send it,
 * even after `prime()`. A reconnect sends it when the cursor is not 0.
 *
 * Dedup assumes strictly climbing ids. A positive id less than or equal to
 * the cursor is a replay and is dropped. An empty `id:` line (`resetId`)
 * clears the cursor, so the next positive id is new. An explicit `id: 0`
 * does the same. A frame with no id line is kept and does not move the
 * cursor. Comment frames update `lastComment` and do not move the cursor.
 */
export function createEventStream(url: string, options: EventStreamOptions = {}): EventStream {
	return new NamedEventStream(url, options)
}

class NamedEventStream implements EventStream {
	events = $state<NamedEvent[]>([])

	readonly #options: EventStreamOptions
	readonly #allowed: readonly string[] | undefined
	readonly #terminal: readonly string[]
	readonly #loop: FrameLoop

	constructor(url: string, options: EventStreamOptions) {
		this.#options = options
		this.#allowed = options.events
		this.#terminal = options.terminal ?? []
		const given = options.requestInit
		const headers = new Headers(given?.headers)
		if (options.headers !== undefined) {
			new Headers(options.headers).forEach((value, key) => {
				headers.set(key, value)
			})
		}
		this.#loop = new FrameLoop({
			url,
			requestInit: { ...given, headers },
			reconnect: options.reconnect,
			onReconnect: options.onReconnect,
			onComment: (frame) => {
				options.onComment?.(frame.comment)
			},
			onFrame: (frame) => this.#onWire(frame),
			catchUp: () => this.#catchUp(),
		})
	}

	get connection(): EventConnection {
		return this.#loop.connection
	}

	get reconnects(): number {
		return this.#loop.reconnects
	}

	get lastEventId(): number {
		return this.#loop.lastEventId
	}

	get lastComment(): number | undefined {
		return this.#loop.lastComment
	}

	prime(events: readonly NamedEvent[]): void {
		for (const event of events) this.#acceptEvent(event, false)
	}

	attach(registerCleanup?: (task: () => () => void) => void): void {
		this.#loop.attach(registerCleanup)
	}

	close(): void {
		this.#loop.close()
	}

	#onWire(frame: SseFrame): FrameDecision {
		if (frame.kind === "comment") return { keep: false }
		const named: NamedEvent = { id: frame.id, name: frame.name, data: frame.data }
		if (frame.idSet) named.idSet = true
		if (frame.resetId) named.resetId = true
		return this.#acceptEvent(named, true)
	}

	/** Keep one event, or drop it.
	 * A wire frame lets the loop move Last-Event-ID from `idSet` / `resetId`, then stop.
	 * Prime and catch-up are not wire frames, so they move the cursor here. */
	#acceptEvent(event: NamedEvent, wire: boolean): FrameDecision {
		if (this.#loop.stopped) return { keep: false }
		if (this.#allowed !== undefined && !this.#allowed.includes(event.name)) return { keep: false }
		if (isReplayId(this.#loop.lastEventId, event)) return { keep: false }
		this.events.push(event)
		this.#options.onFrame?.(event)
		if (!wire) this.#loop.noteId(event)
		const stop = this.#terminal.includes(event.name)
		if (!wire && stop) this.#loop.close()
		return { keep: true, stop: wire && stop }
	}

	async #catchUp(): Promise<void> {
		const catchUp = this.#options.catchUp
		if (catchUp === undefined) return
		let missed: readonly NamedEvent[] | void
		try {
			missed = await catchUp()
		} catch {
			return
		}
		if (this.#loop.stopped || missed === undefined) return
		for (const event of missed) {
			this.#acceptEvent(event, false)
			if (this.#loop.stopped) return
		}
	}
}
