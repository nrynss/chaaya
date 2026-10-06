import { runInEffect } from "./effect.svelte.js"
import { parseNamedFrame } from "./frame.js"
import type { EventFrame, NamedEvent } from "./frame.js"
import { takeFrames } from "./frame.js"
import { isPaused, watchPause } from "./pause.js"
import { reconnectDelay, reconnectSettings } from "./reconnect.js"
import type { ReconnectOptions } from "./reconnect.js"

/** Where one stream stands. Connecting covers the first attempt, live covers
 * an open stream, reconnecting covers a retry, paused covers a page that
 * cannot hold a stream while hidden or offline, failed covers a stream that
 * gave up, and closed covers a watch that ended. */
export type StreamConnection = "connecting" | "live" | "reconnecting" | "paused" | "failed" | "closed"

/** What the caller does with one parsed frame.
 *
 * `keep` means the frame belongs to the caller's model. Last-Event-ID moves
 * only for a kept frame that carried an id line (`idSet` or `resetId`).
 * Set `takeId` to move that id without keeping the frame, or to keep a frame
 * without moving it. Omit `takeId` and it follows `keep`.
 * `stop` ends the watch after the id is applied. */
export interface FrameDecision {
	keep: boolean
	takeId?: boolean
	stop?: boolean
}

/** What the shared follow loop needs. The caller decides what a frame means. */
export interface FrameLoopOptions {
	/** The event stream to follow. */
	url: string
	/** Extra fetch fields. `accept` is always `text/event-stream`. `signal` is
	 * ignored. The loop owns the abort. */
	requestInit?: RequestInit
	/** The reconnect schedule. Omit for the shared default. */
	reconnect?: ReconnectOptions
	/** Pause while the page is hidden or offline instead of spending
	 * reconnect attempts it cannot use. The loop resumes at once when the
	 * page returns. Defaults to true. Pass false when the page must keep
	 * retrying while hidden. */
	pauseWhenHidden?: boolean
	/** One event frame (`kind: "event"`). Comment frames never arrive here.
	 * They set `lastComment` and call `onComment`, and there is nothing to
	 * return for them. A thrown error is a dropped frame, not a dropped stream. */
	onFrame: (frame: EventFrame) => FrameDecision
	/** A comment arrived. The argument is the comment text, the same string
	 * `createEventStream` passes to its `onComment`. `lastComment` is already
	 * the timestamp. The loop does not call `onFrame`, and an `id:` on the
	 * comment does not move the cursor. A thrown error is a dropped frame,
	 * not a dropped stream. */
	onComment?: (comment: string) => void
	/** Once the connection is live. A throw leaves the stream alone. Call `close()` to end the watch. */
	catchUp?: () => Promise<void>
	/** Runs when a dropped stream opens again. It receives the new count. */
	onReconnect?: (count: number) => void
}

/**
 * Ids are assumed to strictly climb.
 *
 * A replay is a positive id that is less than or equal to the cursor. An
 * empty id line (`resetId`) sets the cursor to 0 and is not a replay. An
 * explicit `id: 0` does the same. A frame with no id line is not compared
 * and does not move the cursor.
 *
 * A caller-built event (catch-up, prime) often omits the flags. A positive
 * id on that event counts as an id line. Zero without flags does not.
 */
export function isReplayId(cursor: number, event: Pick<NamedEvent, "id" | "idSet" | "resetId">): boolean {
	if (event.resetId === true) return false
	if (event.id === 0) return false
	const hasId = event.idSet === true || (event.idSet === undefined && event.resetId === undefined)
	if (!hasId) return false
	return event.id <= cursor
}

/** The cursor after a kept frame. A replay still returns the old cursor. The caller should have dropped it. */
export function nextEventId(cursor: number, event: Pick<NamedEvent, "id" | "idSet" | "resetId">): number {
	if (isReplayId(cursor, event)) return cursor
	if (event.resetId === true) return 0
	if (event.idSet === true) return event.id
	if (event.id !== 0 && event.idSet === undefined && event.resetId === undefined) return event.id
	return cursor
}

/** Build one fetch init. On a reconnect, a cursor other than 0 is sent as
 * Last-Event-ID. The first connect never sends it, even when prime() already
 * stored an id. */
function fetchInit(options: FrameLoopOptions, signal: AbortSignal, lastEventId: number, reconnecting: boolean): RequestInit {
	const given = options.requestInit
	const headers = new Headers(given?.headers)
	headers.set("accept", "text/event-stream")
	if (reconnecting && lastEventId !== 0) headers.set("last-event-id", String(lastEventId))
	return { ...given, headers, signal }
}

/**
 * Follow one server-sent stream over fetch.
 *
 * This is the only read loop. `JobStream` projects frames onto a progress
 * reading. `createEventStream` projects them onto a list of named events.
 * Neither copies connect, read, or reconnect.
 *
 * The transport is fetch, not `EventSource`, because fetch reports a refused
 * status and this loop bounds its own delay. There is no WebSocket path.
 * A hidden or offline page cannot hold a stream, so the loop pauses instead
 * of reconnecting. It aborts the open stream, drops any pending retry, and
 * waits as `paused` without counting an attempt. The first visible or online
 * event resets the attempt count and connects at once. Pass
 * `pauseWhenHidden: false` to keep retrying while hidden.
 * Construction touches nothing, so importing this module on a server is safe.
 */
export class FrameLoop {
	connection = $state<StreamConnection>("connecting")
	reconnects = $state(0)
	/** Id of the last kept frame that carried an id line. Zero means none yet, an explicit zero, or an empty id line. */
	lastEventId = $state(0)
	/** Epoch milliseconds of the last comment frame. Undefined until one arrives. */
	lastComment = $state<number | undefined>(undefined)

	#options: FrameLoopOptions
	#schedule: ReturnType<typeof reconnectSettings>
	#controller: AbortController | undefined = undefined
	#timer: ReturnType<typeof setTimeout> | undefined = undefined
	#attempts = 0
	#opened = false
	#stopped = false
	#paused = false
	#unwatch: (() => void) | undefined = undefined

	constructor(options: FrameLoopOptions) {
		this.#options = options
		this.#schedule = reconnectSettings(options.reconnect)
	}

	/** True after close() or a terminal decision. */
	get stopped(): boolean {
		return this.#stopped
	}

	/** Move the cursor the way a kept frame would. Used by prime() and catch-up, which are not wire frames. */
	noteId(event: Pick<NamedEvent, "id" | "idSet" | "resetId">): void {
		this.lastEventId = nextEventId(this.lastEventId, event)
	}

	/** Follow the stream. Call it once during component initialisation. A test passes its own cleanup runner. */
	attach(registerCleanup: (task: () => () => void) => void = runInEffect): void {
		if (this.#options.pauseWhenHidden !== false) {
			this.#unwatch = watchPause(
				() => this.#pause(),
				() => this.#resume(),
			)
			if (isPaused()) this.#pause()
		}
		if (!this.#paused) void this.#connect()
		registerCleanup(() => () => this.close())
	}

	/** Stop following. It cancels the stream and any pending reconnect. A second call changes nothing. */
	close(): void {
		if (this.#stopped) return
		this.#stop("closed")
	}

	#stop(state: StreamConnection): void {
		this.#stopped = true
		this.#unwatch?.()
		this.#unwatch = undefined
		if (this.#timer !== undefined) {
			clearTimeout(this.#timer)
			this.#timer = undefined
		}
		this.#controller?.abort()
		this.#controller = undefined
		this.connection = state
	}

	/** Park the loop while the page cannot hold a stream. It aborts the open
	 * stream and drops any pending retry without counting an attempt. A
	 * repeat call changes nothing. */
	#pause(): void {
		if (this.#stopped || this.#paused) return
		this.#paused = true
		if (this.#timer !== undefined) {
			clearTimeout(this.#timer)
			this.#timer = undefined
		}
		this.#controller?.abort()
		this.#controller = undefined
		this.connection = "paused"
	}

	/** Connect at once after a pause. It resets the attempt count, so the
	 * attempts spent before the pause do not shorten the fresh schedule. A
	 * call while live changes nothing. */
	#resume(): void {
		if (this.#stopped || !this.#paused) return
		this.#paused = false
		this.#attempts = 0
		void this.#connect()
	}

	#reconnect(): void {
		if (this.#stopped) return
		if (this.#paused || (this.#options.pauseWhenHidden !== false && isPaused())) {
			this.#pause()
			return
		}
		if (!this.#opened || this.#attempts >= this.#schedule.attempts) {
			this.#stop("failed")
			return
		}
		const delay = reconnectDelay(this.#attempts, this.#schedule)
		this.#attempts += 1
		this.connection = "reconnecting"
		this.#timer = setTimeout(() => {
			this.#timer = undefined
			void this.#connect()
		}, delay)
	}

	async #connect(): Promise<void> {
		if (this.#stopped || this.#paused) return
		/** A server has no stream to open, so it runs no part of this. */
		if (typeof window === "undefined") return
		const controller = new AbortController()
		this.#controller = controller
		let response: Response
		try {
			response = await fetch(this.#options.url, fetchInit(this.#options, controller.signal, this.lastEventId, this.#opened))
		} catch {
			if (this.#stopped) return
			this.#reconnect()
			return
		}
		if (this.#stopped) return
		const body = response.body
		if (!response.ok || body === null) {
			this.#stop("failed")
			return
		}
		this.#attempts = 0
		if (this.#opened) {
			this.reconnects += 1
			this.#options.onReconnect?.(this.reconnects)
		}
		this.#opened = true
		this.connection = "live"
		/** Read the frames while the catch-up runs. A stop that arrives first wins. */
		void this.#read(body)
		await this.#catchUp()
	}

	async #catchUp(): Promise<void> {
		const catchUp = this.#options.catchUp
		if (catchUp === undefined) return
		try {
			await catchUp()
		} catch {
			return
		}
	}

	async #read(body: ReadableStream<Uint8Array>): Promise<void> {
		const reader = body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""
		try {
			for (;;) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })
				const taken = takeFrames(buffer)
				buffer = taken.rest
				for (const frame of taken.frames) {
					this.#dispatch(frame)
					if (this.#stopped) return
				}
			}
		} catch {
			/** A read error is a dropped stream, and the rule below answers it. */
		}
		if (this.#stopped) return
		this.#reconnect()
	}

	/** Apply one frame. A frame the reader cannot parse costs one reading and never the stream.
	 * A comment is liveness only. It never reaches `onFrame`, so it cannot move the cursor or stop the watch. */
	#dispatch(text: string): void {
		const parsed = parseNamedFrame(text)
		if (!parsed.ok) return
		const frame = parsed.value
		if (frame.kind === "comment") {
			this.lastComment = Date.now()
			try {
				this.#options.onComment?.(frame.comment)
			} catch {
				return
			}
			return
		}
		let decision: FrameDecision
		try {
			decision = this.#options.onFrame(frame)
		} catch {
			return
		}
		const takeId = decision.takeId ?? decision.keep
		if (takeId && (frame.idSet || frame.resetId)) this.lastEventId = frame.id
		if (decision.stop) this.#stop("closed")
	}
}
