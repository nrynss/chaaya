import type { ChaayaError } from "../error.js"
import type { JobProgress } from "../progress.js"
import { Notifier } from "../observable.js"
import { isPaused, watchPause } from "../sse/pause.js"
import { mergeProgress } from "./job.js"
import type { JobConnection } from "./types.js"

/** What one poller needs. The fetch and the map are the backend. The loop is not. */
export interface JobPollerOptions<T> {
	/** Read the work once. It receives an abort signal and resolves the raw
	 * answer. A rejection counts toward the error budget. */
	fetchState: (signal: AbortSignal) => Promise<T>
	/** Map the raw answer onto a progress reading. A throw counts toward
	 * the error budget like a failed read, so an unreadable answer is
	 * transient rather than terminal. */
	toProgress: (response: T) => JobProgress
	/** Whether a mapped reading ends the watch. Core has no terminal enum of its own. */
	isTerminal: (reading: JobProgress) => boolean
	/** The first interval between reads, in milliseconds. Default 1000. */
	intervalMs?: number
	/** The ceiling the interval backs off to, in milliseconds. Default 8000. */
	maxIntervalMs?: number
	/** Consecutive failures the watch survives before it fails. Default 3. */
	errorBudget?: number
	/** The whole watch fails after this many milliseconds. Omit for no timeout.
	 * Time spent paused does not count. */
	timeoutMs?: number
	/** Stop the watch when this aborts. The watch owns its own abort apart
	 * from this, so an in-flight read still cancels on close. */
	signal?: AbortSignal
	/** Pause while the page is hidden or offline instead of polling a job the
	 * page cannot see. The watch reads at once when the page returns.
	 * Defaults to true. */
	pauseWhenHidden?: boolean
	/** Runs after a mapped reading lands. A failed read does not call it. */
	onPoll?: (reading: JobProgress) => void
}

/** Whether two readings carry the same progress. Every field must match, and
 * detail compares by value. The interval backs off only while this holds. */
function sameReading(a: JobProgress, b: JobProgress): boolean {
	return (
		a.id === b.id &&
		a.stage === b.stage &&
		a.current === b.current &&
		a.total === b.total &&
		a.status === b.status &&
		JSON.stringify(a.detail ?? null) === JSON.stringify(b.detail ?? null)
	)
}

/** Follow one job by polling and publish a progress reading.
 *
 * The reading has the same shape `JobStream` publishes, so a view cannot
 * tell polling from streaming. Fields merge the same way: a present field
 * overwrites, an absent field stays.
 *
 * The interval backs off while the reading stays unchanged, doubling up to
 * the ceiling, and resets to the base on any change. A failed read keeps
 * the current interval and counts toward the error budget. The budget counts
 * consecutive failures, so one success clears it. The whole watch fails past
 * the timeout. A terminal reading ends the watch and becomes the last change
 * this poller makes.
 *
 * The pause rule matches `FrameLoop` through the same helper. While the page
 * is hidden or offline the poller sends no request and runs no timer. The
 * first visible or online event reads at once. Time spent paused does not
 * count toward the timeout.
 *
 * Construction touches nothing, so importing this module on a server is safe.
 *
 * The poller is an observable. It notifies once per landed reading, and
 * once per pause, resume, and end of the watch. A failed read that retries
 * changes nothing a view reads, so it notifies nothing.
 */
export class JobPoller<T> extends Notifier {
	#progress: JobProgress = {}
	#error: ChaayaError | undefined = undefined
	#connection: JobConnection = "connecting"

	#options: JobPollerOptions<T>
	#timer: ReturnType<typeof setTimeout> | undefined = undefined
	#controller: AbortController | undefined = undefined
	#delay: number
	#maxDelay: number
	#budget: number
	#failures = 0
	#deadline: number | undefined = undefined
	#pausedAt: number | undefined = undefined
	#paused = false
	#stopped = false
	#unwatch: (() => void) | undefined = undefined
	#onAbort: (() => void) | undefined = undefined

	constructor(options: JobPollerOptions<T>) {
		super()
		this.#options = options
		this.#delay = options.intervalMs ?? 1000
		this.#maxDelay = options.maxIntervalMs ?? 8000
		this.#budget = options.errorBudget ?? 3
	}

	/** The published reading. Fields stay absent until a poll sets them. A
	 * change replaces the object. */
	get progress(): JobProgress {
		return this.#progress
	}

	/** The failure that ended the watch, when it ended in failure. */
	get error(): ChaayaError | undefined {
		return this.#error
	}

	/** Where the watch stands. There is no reconnecting state. A failed read
	 * retries on the same interval until the budget runs out. */
	get connection(): JobConnection {
		return this.#connection
	}

	/** True after close, a terminal reading, or a failure. */
	get stopped(): boolean {
		return this.#stopped
	}

	/** Start polling. It returns the teardown, which closes the watch. A
	 * Svelte component passes the poller to `attach` from
	 * `@nrynss/chaaya/svelte`, which calls the teardown with the component. */
	attach(): () => void {
		if (this.#options.timeoutMs !== undefined) this.#deadline = Date.now() + this.#options.timeoutMs
		const signal = this.#options.signal
		if (signal !== undefined) {
			if (signal.aborted) {
				this.#stop("closed")
				return () => this.close()
			}
			this.#onAbort = () => this.close()
			signal.addEventListener("abort", this.#onAbort, { once: true })
		}
		if (this.#options.pauseWhenHidden !== false) {
			this.#unwatch = watchPause(
				() => this.#pause(),
				() => this.#resume(),
			)
			if (isPaused()) this.#pause()
		}
		if (!this.#paused) void this.#poll()
		return () => this.close()
	}

	/** Stop polling. It cancels the in-flight read and any pending poll. A second call changes nothing. */
	close(): void {
		if (this.#stopped) return
		this.#stop("closed")
	}

	#stop(state: JobConnection): void {
		this.#stopped = true
		this.#unwatch?.()
		this.#unwatch = undefined
		if (this.#onAbort !== undefined && this.#options.signal !== undefined) {
			this.#options.signal.removeEventListener("abort", this.#onAbort)
			this.#onAbort = undefined
		}
		if (this.#timer !== undefined) {
			clearTimeout(this.#timer)
			this.#timer = undefined
		}
		this.#controller?.abort()
		this.#controller = undefined
		this.#connection = state
		this.notify()
	}

	/** Park the watch while the page cannot see the job. It sends no request
	 * and runs no timer. The timeout freezes, so hidden time never fails the
	 * watch. A repeat call changes nothing. */
	#pause(): void {
		if (this.#stopped || this.#paused) return
		this.#paused = true
		this.#pausedAt = Date.now()
		if (this.#timer !== undefined) {
			clearTimeout(this.#timer)
			this.#timer = undefined
		}
		this.#controller?.abort()
		this.#controller = undefined
		this.#connection = "paused"
		this.notify()
	}

	/** Read at once after a pause. It shifts the deadline past the hidden
	 * time and clears no failure count, because a pause is not a failure. A
	 * call while polling changes nothing. */
	#resume(): void {
		if (this.#stopped || !this.#paused) return
		this.#paused = false
		if (this.#pausedAt !== undefined) {
			if (this.#deadline !== undefined) this.#deadline += Date.now() - this.#pausedAt
			this.#pausedAt = undefined
		}
		this.#connection = "connecting"
		this.notify()
		void this.#poll()
	}

	#later(ms: number): void {
		this.#timer = setTimeout(() => {
			this.#timer = undefined
			void this.#poll()
		}, ms)
	}

	async #poll(): Promise<void> {
		if (this.#stopped || this.#paused) return
		if (this.#deadline !== undefined && Date.now() >= this.#deadline) {
			this.#error = { code: "poll_timeout", message: "the watch ran past its timeout" }
			this.#stop("failed")
			return
		}
		const controller = new AbortController()
		this.#controller = controller
		let response: T
		const before = this.#progress
		try {
			response = await this.#options.fetchState(controller.signal)
			if (this.#stopped || this.#paused) return
			this.#accept(this.#options.toProgress(response))
		} catch {
			if (this.#stopped || this.#paused) return
			this.#failures += 1
			if (this.#failures > this.#budget) {
				this.#error = { code: "poll_failed", message: "the watch could not read the work" }
				this.#stop("failed")
				return
			}
			/** A callback that threw after the reading landed still leaves
			 * that reading published, so a view hears it. */
			if (this.#progress !== before) this.notify()
			this.#later(this.#delay)
		}
	}

	/** Apply one mapped reading. An unchanged reading doubles the interval up
	 * to the ceiling. Any change resets it. A terminal reading ends the watch. */
	#accept(reading: JobProgress): void {
		this.#failures = 0
		const base = this.#options.intervalMs ?? 1000
		if (sameReading(this.#progress, mergeProgress(this.#progress, reading))) this.#delay = Math.min(this.#delay * 2, this.#maxDelay)
		else this.#delay = base
		this.#progress = mergeProgress(this.#progress, reading)
		this.#options.onPoll?.(reading)
		if (this.#options.isTerminal(reading)) {
			this.#stop("closed")
			return
		}
		this.#connection = "live"
		this.notify()
		this.#later(this.#delay)
	}
}
