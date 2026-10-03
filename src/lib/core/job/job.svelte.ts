import type { ChaayaError } from "../error.js"
import type { JobProgress } from "../progress.js"
import { runInEffect } from "../sse/effect.svelte.js"
import { parseNamedFrame, takeFrames } from "../sse/frame.js"
import type { NamedEvent } from "../sse/frame.js"
import { reconnectDelay, reconnectSettings } from "../sse/reconnect.js"
import type { JobCatchUp, JobConnection, JobFrameAction, JobStreamOptions } from "./types.js"

/** Build one fetch init. The caller may pass auth. Accept stays the event
 * stream type, and the abort signal is always the stream's own. On a
 * reconnect, a last accepted id other than 0 is sent as Last-Event-ID.
 * An empty id line on an accepted frame clears that id. A missing id line does not. */
function fetchInit(options: JobStreamOptions, signal: AbortSignal, lastEventId: number, reconnecting: boolean): RequestInit {
	const given = options.requestInit
	const headers = new Headers(given?.headers)
	headers.set("accept", "text/event-stream")
	if (reconnecting && lastEventId !== 0) headers.set("last-event-id", String(lastEventId))
	return { ...given, headers, signal }
}

/** Copy defined fields onto the published reading. An omitted field stays. */
function mergeProgress(base: JobProgress, reading: JobProgress): JobProgress {
	const next: JobProgress = { ...base }
	if (reading.id !== undefined) next.id = reading.id
	if (reading.stage !== undefined) next.stage = reading.stage
	if (reading.current !== undefined) next.current = reading.current
	if (reading.total !== undefined) next.total = reading.total
	if (reading.status !== undefined) next.status = reading.status
	if (reading.detail !== undefined) next.detail = reading.detail
	return next
}

/** Follow one event stream and publish a progress reading.
 *
 * The stream reads with fetch and not with EventSource. Fetch reports the
 * status of a refused stream, and it lets this class bound its own reconnect
 * delay instead of taking the browser's schedule.
 *
 * Construction touches nothing, so importing this module on a server is safe.
 * attach() opens the stream, and a component calls it during initialisation.
 * The stream therefore opens before the first render, and any frame that
 * arrives before the component mounts still lands in the published state.
 *
 * Each connection waits for the stream to open, then reads state to catch up
 * when `fetchState` is set, then applies frames as they arrive. A refused
 * stream fails at once, because a status is an answer. A stream that opened
 * and then dropped reconnects with a bounded delay. A stream that never
 * opened fails instead, because a first failure usually repeats. A terminal
 * action ends the watch and becomes the last change this stream makes.
 *
 * `frameMap` decides what each event name means. It is a plain object's own
 * keys. `Object.hasOwn` ignores inherited names such as `toString`. A name
 * that is missing, a handler that is not a function, and a result that is not
 * `ignore`, `progress`, or `terminal` are all ignored. They do not end the
 * watch. `shouldAccept` can refuse a frame before the map runs.
 */
export class JobStream {
	/** The published reading. Fields stay absent until a frame or a catch-up sets them. */
	progress = $state<JobProgress>({})
	/** The failure of a terminal action, when that action carried one. */
	error = $state<ChaayaError | undefined>(undefined)
	/** Where the stream stands. */
	connection = $state<JobConnection>("connecting")
	/** The count of dropped streams that opened again. */
	reconnects = $state(0)
	/** Accepted frames that changed the reading, in arrival order. */
	frames = $state<NamedEvent[]>([])

	#options: JobStreamOptions
	#schedule: ReturnType<typeof reconnectSettings>
	#controller: AbortController | undefined = undefined
	#timer: ReturnType<typeof setTimeout> | undefined = undefined
	#attempts = 0
	#opened = false
	#stopped = false
	/** Id of the last accepted event that carried an id line. Zero means none yet, an explicit zero, or an empty id line that reset it. A later accepted frame with no id line leaves this alone. */
	#lastEventId = 0

	constructor(options: JobStreamOptions) {
		this.#options = options
		this.#schedule = reconnectSettings(options.reconnect)
	}

	/** Follow the stream. Call it once during component initialisation. The
	 * stream opens before the first render, and it closes when that component
	 * is destroyed. A test passes its own cleanup runner, because only a
	 * component owns the effect context the default runner needs. */
	attach(registerCleanup: (task: () => () => void) => void = runInEffect): void {
		void this.#connect()
		registerCleanup(() => () => this.close())
	}

	/** Stop following. It cancels the stream and any pending reconnect. A second call changes nothing. */
	close(): void {
		if (this.#stopped) return
		this.#stop("closed")
	}

	/** End the watch in one state. Every path out of the read loop lands here, so the stream stops exactly once. */
	#stop(state: JobConnection): void {
		this.#stopped = true
		if (this.#timer !== undefined) {
			clearTimeout(this.#timer)
			this.#timer = undefined
		}
		this.#controller?.abort()
		this.#controller = undefined
		this.connection = state
	}

	/** Answer a stream that dropped. A stream that never opened gives up,
	 * because a first failure usually repeats. A stream that opened
	 * reconnects with a bounded delay, up to the attempt ceiling. */
	#reconnect(): void {
		if (this.#stopped) return
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
		if (this.#stopped) return
		/** A server has no stream to open, so it runs no part of this. */
		if (typeof window === "undefined") return
		const controller = new AbortController()
		this.#controller = controller
		let response: Response
		try {
			response = await fetch(
				this.#options.url,
				fetchInit(this.#options, controller.signal, this.#lastEventId, this.#opened),
			)
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
		/** Read the frames while the state read runs. A terminal that arrives first wins, because it stops the watch. */
		void this.#read(body)
		await this.#catchUp()
	}

	/** Read state once the stream is open. A failed read leaves the stream
	 * alone. A state read answers late, so it never overwrites a reading the
	 * stream already carried past it. */
	async #catchUp(): Promise<void> {
		const fetchState = this.#options.fetchState
		if (fetchState === undefined) return
		let catchUp: JobCatchUp
		try {
			catchUp = await fetchState()
			if (this.#options.prepareState !== undefined) {
				const prepared = this.#options.prepareState(catchUp)
				if (prepared === undefined) return
				catchUp = prepared
			}
		} catch {
			return
		}
		if (this.#stopped) return
		const reading = catchUp.reading
		const latest = this.progress.current
		if (reading.current !== undefined && latest !== undefined && reading.current < latest) return
		if (reading.current === undefined && latest !== undefined) return
		this.progress = mergeProgress(this.progress, reading)
		if (catchUp.error !== undefined) this.error = catchUp.error
		this.#options.onState?.(reading)
		if (this.#options.isTerminal?.(reading)) this.#stop("closed")
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
					this.#accept(frame)
					if (this.#stopped) return
				}
			}
		} catch {
			/** A read error is a dropped stream, and the rule below answers it. */
		}
		if (this.#stopped) return
		this.#reconnect()
	}

	/** Apply one frame. A frame the reader cannot parse costs one reading and never the stream. */
	#accept(text: string): void {
		const parsed = parseNamedFrame(text)
		if (!parsed.ok) return
		const frame = parsed.value
		/** Comment frames (Keel heartbeats) never reach frameMap. */
		if (frame.kind !== "event") return
		const named: NamedEvent = { id: frame.id, name: frame.name, data: frame.data }
		if (frame.idSet) named.idSet = true
		if (frame.resetId) named.resetId = true
		if (this.#options.shouldAccept !== undefined && !this.#options.shouldAccept(named)) return
		const map = this.#options.frameMap
		const own = Object.hasOwn(map, named.name) ? map[named.name] : undefined
		if (typeof own !== "function") return
		const action = asFrameAction(own(named))
		if (action.kind === "ignore") return
		this.frames.push(named)
		if (named.resetId || named.idSet) this.#lastEventId = named.id
		this.#options.onAccept?.(named)
		if (action.kind === "progress") {
			this.progress = mergeProgress(this.progress, action.reading)
			return
		}
		if (action.reading !== undefined) this.progress = mergeProgress(this.progress, action.reading)
		if (action.error !== undefined) this.error = action.error
		this.#stop("closed")
	}
}

/** Keep a handler result only when its kind is one this loop understands. Anything else is an ignore, never a terminal. */
function asFrameAction(value: unknown): JobFrameAction {
	if (typeof value !== "object" || value === null) return { kind: "ignore" }
	const kind = (value as { kind?: unknown }).kind
	if (kind === "ignore") return { kind: "ignore" }
	if (kind === "progress") {
		const reading = (value as { reading?: unknown }).reading
		if (typeof reading !== "object" || reading === null) return { kind: "ignore" }
		return { kind: "progress", reading: reading as JobProgress }
	}
	if (kind === "terminal") {
		const source = value as { reading?: unknown; error?: unknown }
		const action: JobFrameAction = { kind: "terminal" }
		if (source.reading !== undefined) {
			if (typeof source.reading !== "object" || source.reading === null) return { kind: "ignore" }
			action.reading = source.reading as JobProgress
		}
		if (source.error !== undefined) action.error = source.error as ChaayaError
		return action
	}
	return { kind: "ignore" }
}
