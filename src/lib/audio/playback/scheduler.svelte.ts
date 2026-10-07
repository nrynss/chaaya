import { planPlacements, type TimedClip } from "./clips.js"

/** The knobs a caller sets on a clip scheduler. */
export interface ClipSchedulerOptions {
	/** The context the scheduler places sources on. The scheduler never
	 * closes it. */
	readonly context: AudioContext
	/** The element whose clock the scheduler follows. The caller owns it. */
	readonly element: HTMLMediaElement
	/** Where clip audio goes. Defaults to the context destination. A test
	 * points it at a tap node and keeps the samples it sounds. */
	readonly destination?: AudioNode
	/** How far the element clock may drift from the planned clock, in
	 * seconds, before a reschedule. Defaults to 0.25. */
	readonly tolerance?: number
	/** How many decoded buffers the cache keeps. Defaults to 8. */
	readonly cacheSize?: number
	/** Where a failed load reports its key and the browser words. */
	readonly onSkipped?: (key: string, reason: string) => void
}

/** How far the element clock may drift before a reschedule, in seconds. */
const DEFAULT_TOLERANCE = 0.25

/** How many decoded buffers the cache keeps when the caller names none. */
const DEFAULT_CACHE_SIZE = 8

/**
 * Timed audio clips previewed against a media element clock. Clips decode
 * once per key into a bounded cache. A play or seek stops every live
 * source and plans the clips that still have sound at the playhead, so an
 * overlapping clip starts now at the right in point and a later clip waits
 * for its offset. A timeupdate past the drift tolerance reschedules the
 * same way. A clip that fails to load reports through the skipped callback
 * and lands in the skipped set, and nothing replaces it.
 *
 * This preview is an approximation. The server mix measures the release.
 * Importing this module does no DOM work. A caller builds the scheduler on
 * a context a gesture owns, then attaches it to the element it owns.
 */
export class ClipScheduler {
	/** The clips the next sync plans, in caller order. */
	clips = $state<TimedClip[]>([])
	/** The keys that failed to load, in failure order. */
	skipped = $state<string[]>([])

	#context: AudioContext
	#element: HTMLMediaElement
	#destination: AudioNode
	#tolerance: number
	#cacheSize: number
	#onSkipped: ((key: string, reason: string) => void) | null
	/* The decoded buffers and the keys still fetching, as plain lists. A
	 * clip list stays short, so a scan beats a map without importing the
	 * framework runtime into the published bundle. */
	#buffers: { key: string; buffer: AudioBuffer }[] = []
	#pending: string[] = []
	#live: AudioBufferSourceNode[] = []
	#playhead = 0
	#contextAtSync = 0
	#attached = false

	constructor(options: ClipSchedulerOptions) {
		this.#context = options.context
		this.#element = options.element
		this.#destination = options.destination ?? options.context.destination
		this.#tolerance = options.tolerance ?? DEFAULT_TOLERANCE
		this.#cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE
		this.#onSkipped = options.onSkipped ?? null
	}

	/** Replace the clip list. The next sync plans the new list. */
	setClips(clips: readonly TimedClip[]): void {
		this.clips = [...clips]
	}

	/** Decode every clip into the cache without sounding anything. A caller
	 * warms the cache inside the gesture before play, so the first sync
	 * starts at once instead of after a fetch. */
	async prepare(): Promise<void> {
		for (const clip of this.clips) {
			await this.#bufferFor(clip.key)
		}
	}

	/** Listen to the element. Play and seek reschedule, pause stops every
	 * source, and a timeupdate past the tolerance reschedules. */
	attach(): void {
		if (this.#attached) return
		this.#attached = true
		this.#element.addEventListener("play", this.#onPlay)
		this.#element.addEventListener("pause", this.#onStop)
		this.#element.addEventListener("seeking", this.#onStop)
		this.#element.addEventListener("seeked", this.#onPlay)
		this.#element.addEventListener("ratechange", this.#onPlay)
		this.#element.addEventListener("timeupdate", this.#onTime)
	}

	/** Drop the element listeners. Live sources keep sounding, so stop them
	 * first when silence matters. */
	detach(): void {
		if (!this.#attached) return
		this.#attached = false
		this.#element.removeEventListener("play", this.#onPlay)
		this.#element.removeEventListener("pause", this.#onStop)
		this.#element.removeEventListener("seeking", this.#onStop)
		this.#element.removeEventListener("seeked", this.#onPlay)
		this.#element.removeEventListener("ratechange", this.#onPlay)
		this.#element.removeEventListener("timeupdate", this.#onTime)
	}

	/** Stop every live source and plan the clips at the playhead. */
	async sync(): Promise<void> {
		this.stopAll()
		const playhead = this.#element.currentTime
		const now = this.#context.currentTime
		this.#playhead = playhead
		this.#contextAtSync = now
		for (const placement of planPlacements(this.clips, playhead, now, this.#element.playbackRate)) {
			const buffer = await this.#bufferFor(placement.key)
			if (!buffer) continue
			if (placement.bufferOffset >= buffer.duration) continue
			const source = this.#context.createBufferSource()
			source.buffer = buffer
			const gain = this.#context.createGain()
			gain.gain.value = placement.gain
			source.connect(gain)
			gain.connect(this.#destination)
			source.onended = (): void => {
				const index = this.#live.indexOf(source)
				if (index >= 0) this.#live.splice(index, 1)
				source.disconnect()
				gain.disconnect()
			}
			this.#live.push(source)
			try {
				source.start(placement.startAt, placement.bufferOffset, placement.playLength)
			} catch {
				const index = this.#live.indexOf(source)
				if (index >= 0) this.#live.splice(index, 1)
			}
		}
	}

	/** Stop every live source. The schedule keeps its clips, so the next
	 * sync plans them again. */
	stopAll(): void {
		for (const source of this.#live) {
			try {
				source.stop()
			} catch {
				// The source ended on its own. Its handler already left.
			}
		}
		this.#live = []
	}

	/** How many live sources play now. A test reads it without listening. */
	get liveCount(): number {
		return this.#live.length
	}

	/** Decode once per key and keep the newest entries. A failure reports
	 * through the skipped callback, lands in the skipped set, and never
	 * retries inside one clip list. */
	async #bufferFor(key: string): Promise<AudioBuffer | null> {
		const cached = this.#buffers.find((entry) => entry.key === key)
		if (cached) return cached.buffer
		if (this.skipped.includes(key)) return null
		/* A second sync can overlap the first while a fetch sits in
		 * flight. The pending list keeps that overlap from decoding twice
		 * or reporting one failure twice. */
		if (this.#pending.includes(key)) return null
		const clip = this.clips.find((entry) => entry.key === key)
		if (!clip) return null
		this.#pending.push(key)
		try {
			const response = await fetch(clip.url)
			if (!response.ok) throw new Error(`status ${response.status}`)
			const bytes = await response.arrayBuffer()
			const buffer = await this.#context.decodeAudioData(bytes)
			this.#buffers.push({ key, buffer })
			while (this.#buffers.length > this.#cacheSize) {
				this.#buffers.shift()
			}
			return buffer
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error)
			this.skipped = [...this.skipped, key]
			this.#onSkipped?.(key, reason)
			return null
		} finally {
			this.#pending = this.#pending.filter((entry) => entry !== key)
		}
	}

	#onPlay = (): void => {
		void this.sync()
	}

	#onStop = (): void => {
		this.stopAll()
	}

	#onTime = (): void => {
		const elapsed = (this.#context.currentTime - this.#contextAtSync) * this.#element.playbackRate
		if (Math.abs(this.#element.currentTime - (this.#playhead + elapsed)) > this.#tolerance) {
			void this.sync()
		}
	}
}
