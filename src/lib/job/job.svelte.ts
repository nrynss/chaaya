import { parseJobEvent, type ErrorBody, type JobEvent } from "../wire"
import { isTerminalStatus, JobFollower, takeFrames } from "./follow"
import type { JobConnection, JobError, JobSnapshot, JobStatus, JobStreamOptions } from "./types"

/** The delay before the first reconnect, in milliseconds. */
const baseReconnectDelayMs = 500
/** The ceiling the reconnect delay doubles up to, in milliseconds. */
const maxReconnectDelayMs = 8000
/** The attempts one stream gets before it gives up. */
const maxReconnectAttempts = 6

/** Copy an error envelope into the plain shape a view renders. */
function toJobError(body: ErrorBody): JobError {
	return body.detail === undefined
		? { code: body.code, message: body.message }
		: { code: body.code, message: body.message, detail: body.detail }
}

/** Follow one job to its end over that job's event feed.
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
 * Each connection waits for the stream to open, then reads the job's state to
 * catch up, then applies frames as they arrive. A refused stream fails at
 * once, because a status is an answer. A stream that opened and then dropped
 * reconnects with a bounded delay. A stream that never opened fails instead,
 * because a first failure usually repeats. The first terminal event ends the
 * job, closes the stream, and becomes the last change this stream makes.
 */
export class JobStream {
	/** The status of the job. It starts queued and stops at the first terminal. */
	status = $state<JobStatus>("queued")
	/** The step the job runs, or undefined before the first reading. */
	stage = $state<string | undefined>(undefined)
	/** The work done so far, or undefined before the first reading. */
	current = $state<number | undefined>(undefined)
	/** The work the job totals, or undefined before the first reading. */
	total = $state<number | undefined>(undefined)
	/** The error of a failed job, or undefined while the job lives. */
	error = $state<JobError | undefined>(undefined)
	/** Where the stream stands. */
	connection = $state<JobConnection>("connecting")
	/** The count of dropped streams that opened again. */
	reconnects = $state(0)
	/** Every accepted frame in arrival order. A component that mounts after
	 * the first frames still reads them here. */
	events = $state<JobEvent[]>([])

	#options: JobStreamOptions
	#follower = new JobFollower()
	#controller: AbortController | undefined = undefined
	#timer: ReturnType<typeof setTimeout> | undefined = undefined
	#attempts = 0
	#opened = false
	#stopped = false

	constructor(options: JobStreamOptions) {
		this.#options = options
	}

	/** Follow the job. Call it once during component initialisation. The
	 * stream opens before the first render, and it closes when that component
	 * is destroyed. */
	attach(): void {
		void this.#connect()
		$effect(() => () => this.close())
	}

	/** Stop following the job. It cancels the stream and any pending
	 * reconnect. A second call changes nothing. */
	close(): void {
		if (this.#stopped) return
		this.#stop("closed")
	}

	/** End the watch in one state. Every path out of the read loop lands
	 * here, so the stream stops exactly once. */
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
		if (!this.#opened || this.#attempts >= maxReconnectAttempts) {
			this.#stop("failed")
			return
		}
		const delay = Math.min(baseReconnectDelayMs * 2 ** this.#attempts, maxReconnectDelayMs)
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
			response = await fetch(this.#options.url, {
				headers: { accept: "text/event-stream" },
				signal: controller.signal
			})
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
		/** Read the frames while the state read runs. A terminal that arrives
		 * first wins, because it stops the watch. */
		void this.#read(body)
		await this.#catchUp()
	}

	/** Read the job's state once the stream is open. A failed read leaves the
	 * stream alone, because only the stream reports the end of the job. */
	async #catchUp(): Promise<void> {
		let snapshot: JobSnapshot
		try {
			snapshot = await this.#options.fetchState()
		} catch {
			return
		}
		if (this.#stopped) return
		const followed = this.#follower.jobId
		if (followed !== undefined && followed !== snapshot.jobId) return
		this.#applySnapshot(snapshot)
	}

	#applySnapshot(snapshot: JobSnapshot): void {
		this.stage = snapshot.stage
		this.current = snapshot.current
		this.total = snapshot.total
		this.error = snapshot.error
		this.status = snapshot.status
		if (isTerminalStatus(snapshot.status)) this.#stop("closed")
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

	/** Apply one frame. A frame the wire cannot read costs one reading and
	 * never the stream. */
	#accept(text: string): void {
		const parsed = parseJobEvent(text)
		if (!parsed.ok) return
		const event = parsed.value
		if (event.name === "heartbeat") return
		if (!this.#follower.accept(event)) return
		this.events.push(event)
		if (event.name === "progress") {
			this.stage = event.stage
			this.current = event.current
			this.total = event.total
			this.status = "running"
			return
		}
		if (event.name === "error") {
			this.error = toJobError(event.error.error)
			this.status = "error"
			this.#stop("closed")
			return
		}
		this.status = event.status
		this.#stop("closed")
	}
}
