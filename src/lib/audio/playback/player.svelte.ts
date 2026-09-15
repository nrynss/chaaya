/** The two ways playback fails. A network failure means the bytes never
 * arrived. A decode failure means they arrived and the browser could not read
 * them. */
export type PlaybackFailure = "network" | "decode"

/** One buffered span of the source, in seconds from its start. */
export interface BufferedSpan {
	readonly start: number
	readonly end: number
}

/** A playback failure, carrying its class and the browser's own words. */
export interface PlaybackError {
	readonly failure: PlaybackFailure
	readonly message: string
}

/** A one frame silent clip. A browser only unlocks playback that a gesture
 * started, and an element with no source never unlocks. Priming the element
 * with this clip spends the first gesture on real audio. */
const silentClip =
	"data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA=="

/** Read the buffered spans of an element into plain numbers, so a consumer
 * can render them and a test can read them back. */
function readSpans(element: HTMLAudioElement): BufferedSpan[] {
	const spans: BufferedSpan[] = []
	const ranges = element.buffered
	for (let index = 0; index < ranges.length; index += 1) {
		spans.push({ start: ranges.start(index), end: ranges.end(index) })
	}
	return spans
}

/** One audio element per app, unlocked by the first gesture and reused for
 * every clip. A browser blocks playback that no gesture started, so the first
 * user gesture primes the element with a silent clip. Every later clip reuses
 * that element, which keeps the unlocked state alive. */
export class AudioPlayer {
	/** True while the element is playing. */
	playing = $state(false)
	/** The element's position, in seconds. */
	currentTime = $state(0)
	/** The element's length, in seconds. */
	duration = $state(0)
	/** The buffered spans of the element. */
	buffered = $state<BufferedSpan[]>([])
	/** The failure of the last load, or null. */
	error = $state<PlaybackError | null>(null)
	/** The source the consumer asked for. */
	source = $state<string | null>(null)

	#element: HTMLAudioElement | null = null
	#rate = $state(1)
	#unlocked = false
	#unlocking: Promise<boolean> | null = null
	#loaded: string | null = null

	/** The playback speed. Setting it drives the element when it exists. */
	get rate(): number {
		return this.#rate
	}
	set rate(value: number) {
		this.#rate = value
		if (this.#element) this.#element.playbackRate = value
	}

	/** Point the element at a source and reset the published state. The
	 * element stays unlocked, so a later play needs no new gesture. */
	load(source: string): void {
		const element = this.#ensureElement()
		this.source = source
		this.#loaded = source
		this.#clear()
		element.src = source
		element.load()
	}

	/** Seek to a position in seconds. */
	seek(seconds: number): void {
		const element = this.#element
		if (!element) return
		element.currentTime = seconds
		this.currentTime = element.currentTime
	}

	/** Pause the element. */
	pause(): void {
		this.#element?.pause()
	}

	/** Unlock the element for this session, then play a source. A refused
	 * unlock or play returns false and never throws. */
	async play(source?: string): Promise<boolean> {
		const target = source ?? this.source
		if (!target) return false
		if (!(await this.unlock())) return false
		if (target !== this.#loaded) this.load(target)
		const element = this.#element
		if (!element) return false
		try {
			await element.play()
			return true
		} catch {
			return false
		}
	}

	/** Spend the first gesture on the element. Later calls reuse the same
	 * promise, so the priming play runs once per session. A refused prime
	 * clears the promise, so the next gesture retries. */
	async unlock(): Promise<boolean> {
		const element = this.#ensureElement()
		if (this.#unlocked) return true
		if (!this.#unlocking) {
			this.#unlocking = this.#prime(element).then((unlocked) => {
				if (!unlocked) this.#unlocking = null
				return unlocked
			})
		}
		return this.#unlocking
	}

	/** Build the element on first use, so no import touches the DOM. */
	#ensureElement(): HTMLAudioElement {
		if (this.#element) return this.#element
		const element = new Audio()
		element.setAttribute("playsinline", "")
		element.preload = "metadata"
		element.playbackRate = this.#rate
		element.addEventListener("timeupdate", this.#readClock)
		element.addEventListener("seeked", this.#readClock)
		element.addEventListener("durationchange", this.#readTimeline)
		element.addEventListener("loadedmetadata", this.#readTimeline)
		element.addEventListener("progress", this.#readBuffered)
		element.addEventListener("play", this.#onPlay)
		element.addEventListener("pause", this.#onPause)
		element.addEventListener("ended", this.#onPause)
		element.addEventListener("ratechange", this.#onRateChange)
		element.addEventListener("error", this.#onError)
		this.#element = element
		return element
	}

	/** Play a silent clip inside the gesture, then rewind and unmute. A muted
	 * clip unlocks a mobile browser, and the rewind hides it from the user. */
	async #prime(element: HTMLAudioElement): Promise<boolean> {
		this.#loaded = silentClip
		element.muted = true
		element.src = silentClip
		try {
			await element.play()
			element.pause()
			element.currentTime = 0
			element.muted = false
			this.#unlocked = true
			return true
		} catch {
			element.muted = false
			return false
		}
	}

	#clear(): void {
		this.playing = false
		this.currentTime = 0
		this.duration = 0
		this.buffered = []
		this.error = null
	}

	#readClock = (): void => {
		const element = this.#element
		if (element) this.currentTime = element.currentTime
	}

	#readTimeline = (): void => {
		const element = this.#element
		if (!element) return
		this.duration = Number.isFinite(element.duration) ? element.duration : 0
		this.buffered = readSpans(element)
	}

	#readBuffered = (): void => {
		const element = this.#element
		if (element) this.buffered = readSpans(element)
	}

	#onPlay = (): void => {
		this.playing = true
	}

	#onPause = (): void => {
		this.playing = false
	}

	#onRateChange = (): void => {
		const element = this.#element
		if (element) this.#rate = element.playbackRate
	}

	#onError = (): void => {
		const element = this.#element
		const media = element?.error
		const source = this.#loaded
		/* Code 1 is an abort, which a source swap causes and no user sees. */
		if (!media || !source || media.code === 1) return
		this.playing = false
		void this.#publish(media, source)
	}

	/** Classify the failure, then publish it if the source still stands. A
	 * source swap during the check makes the result stale. */
	async #publish(media: MediaError, source: string): Promise<void> {
		const failure = await this.#classify(media.code, source)
		if (this.#loaded !== source) return
		this.error = { failure, message: media.message }
	}

	async #classify(code: number, source: string): Promise<PlaybackFailure> {
		if (code === 2) return "network"
		if (code === 3) return "decode"
		return (await this.#reached(source)) ? "decode" : "network"
	}

	/** A source error covers a file the browser never fetched and bytes it
	 * could not read. A get response that answers ok means the bytes arrived,
	 * so the browser failed to decode them. A blob URL rejects every request
	 * that is not a get, so a head probe would misread a decode failure. */
	async #reached(source: string): Promise<boolean> {
		try {
			const response = await fetch(source, { cache: "no-store" })
			await response.body?.cancel()
			return response.ok
		} catch {
			return false
		}
	}
}
