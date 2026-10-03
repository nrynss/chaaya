import type { ChaayaError } from "../error.js"
import type { JobProgress } from "../progress.js"
import { FrameLoop } from "../sse/loop.svelte.js"
import type { FrameDecision } from "../sse/loop.svelte.js"
import type { EventFrame, NamedEvent } from "../sse/frame.js"
import type { JobCatchUp, JobConnection, JobFrameAction, JobStreamOptions } from "./types.js"

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
 * The read loop is `FrameLoop`. This class only maps a frame onto a progress
 * reading. Fetch, `Last-Event-ID`, reconnect, and abort are not copied here.
 *
 * The stream reads with fetch and not with EventSource. Fetch reports the
 * status of a refused stream, and the loop bounds its own reconnect delay
 * instead of taking the browser's schedule. There is no WebSocket path.
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
 *
 * Comment frames never reach `onFrame` or `frameMap`, and do not move
 * Last-Event-ID, even when a comment carries an id line. The loop records
 * them on `lastComment` for a view that wants a heartbeat.
 */
export class JobStream {
	/** The published reading. Fields stay absent until a frame or a catch-up sets them. */
	progress = $state<JobProgress>({})
	/** The failure of a terminal action, when that action carried one. */
	error = $state<ChaayaError | undefined>(undefined)
	/** Accepted frames that changed the reading, in arrival order. */
	frames = $state<NamedEvent[]>([])

	#options: JobStreamOptions
	#loop: FrameLoop

	constructor(options: JobStreamOptions) {
		this.#options = options
		this.#loop = new FrameLoop({
			url: options.url,
			requestInit: options.requestInit,
			reconnect: options.reconnect,
			onReconnect: options.onReconnect,
			onFrame: (frame) => this.#accept(frame),
			catchUp: () => this.#catchUp(),
		})
	}

	/** Where the stream stands. */
	get connection(): JobConnection {
		return this.#loop.connection
	}

	/** The count of dropped streams that opened again. */
	get reconnects(): number {
		return this.#loop.reconnects
	}

	/** Epoch milliseconds of the last comment frame. Undefined until one arrives. */
	get lastComment(): number | undefined {
		return this.#loop.lastComment
	}

	/** Follow the stream. Call it once during component initialisation. The
	 * stream opens before the first render, and it closes when that component
	 * is destroyed. A test passes its own cleanup runner, because only a
	 * component owns the effect context the default runner needs. */
	attach(registerCleanup?: (task: () => () => void) => void): void {
		this.#loop.attach(registerCleanup)
	}

	/** Stop following. It cancels the stream and any pending reconnect. A second call changes nothing. */
	close(): void {
		this.#loop.close()
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
		if (this.#loop.stopped) return
		const reading = catchUp.reading
		const latest = this.progress.current
		if (reading.current !== undefined && latest !== undefined && reading.current < latest) return
		if (reading.current === undefined && latest !== undefined) return
		this.progress = mergeProgress(this.progress, reading)
		if (catchUp.error !== undefined) this.error = catchUp.error
		this.#options.onState?.(reading)
		if (this.#options.isTerminal?.(reading)) this.close()
	}

	/** Apply one event frame. A refusal, a missing name, and an ignore do not move Last-Event-ID. Comments never arrive here. */
	#accept(frame: EventFrame): FrameDecision {
		if (this.#loop.stopped) return { keep: false }
		const named: NamedEvent = { id: frame.id, name: frame.name, data: frame.data }
		if (frame.idSet) named.idSet = true
		if (frame.resetId) named.resetId = true
		if (this.#options.shouldAccept !== undefined && !this.#options.shouldAccept(named)) return { keep: false }
		const map = this.#options.frameMap
		const own = Object.hasOwn(map, named.name) ? map[named.name] : undefined
		if (typeof own !== "function") return { keep: false }
		const action = asFrameAction(own(named))
		if (action.kind === "ignore") return { keep: false }
		this.frames.push(named)
		this.#options.onAccept?.(named)
		if (action.kind === "progress") {
			this.progress = mergeProgress(this.progress, action.reading)
			return { keep: true }
		}
		if (action.reading !== undefined) this.progress = mergeProgress(this.progress, action.reading)
		if (action.error !== undefined) this.error = action.error
		return { keep: true, stop: true }
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
