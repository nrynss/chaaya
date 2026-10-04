/** The three ways playback fails. A network failure means the bytes never
 * arrived. A decode failure means they arrived and the browser could not
 * read them. An output failure means they read fine but the audio sink could
 * not carry them, so the element keeps playing without sound. */
export type PlaybackFailure = "network" | "decode" | "output"

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

/** A refused play, carrying the browser refusal name and message. */
export interface PlayRefusal {
	readonly name: string
	readonly message: string
}

/** The words a browser reports when the audio sink dies under a playing
 * clip. The element raises that loss as a decode coded error, the same
 * code a fatal fault in the source carries mid play, so the error's own
 * message is the only prompt evidence that names the sink instead of the
 * decoder. */
const SINK_FAULT = "OnMediaSinkAudioError"

/** A one frame silent clip. A browser only unlocks playback that a gesture
 * started, and an element with no source never unlocks. Priming the element
 * with this clip spends the first gesture on real audio. */
const silentClip =
	"data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA=="

/** Read the buffered spans of an element into plain numbers, so a consumer
 * can render them and a test can read them back. */
function readSpans(element: HTMLMediaElement): BufferedSpan[] {
	const spans: BufferedSpan[] = []
	const ranges = element.buffered
	for (let index = 0; index < ranges.length; index += 1) {
		spans.push({ start: ranges.start(index), end: ranges.end(index) })
	}
	return spans
}

/** Read a refusal from a rejected play, so a consumer can log the cause.
 * The rejection carries a name such as NotAllowedError and its message. */
function toRefusal(error: unknown): PlayRefusal {
	if (typeof error === "object" && error !== null && "name" in error && "message" in error) {
		const { name, message } = error as { name: unknown; message: unknown }
		if (typeof name === "string" && typeof message === "string") return { name, message }
	}
	return { name: "UnknownError", message: String(error) }
}

/** The element a player drives when the caller owns it. A video element in
 * the caller's markup is the common case. Without one the player creates its
 * own audio element. */
export interface AudioPlayerOptions {
	/** The element the caller owns. The player attaches its listeners to it
	 * and drives its source through load and play, so the caller hands
	 * sources to the player and not to the element. The element stays the
	 * caller's to render and to size. */
	readonly element: HTMLMediaElement
}

/** One media element per app, unlocked by the first gesture and reused for
 * every clip. A browser blocks playback that no gesture started, so the first
 * user gesture primes the element with a silent clip. Every later clip reuses
 * that element, which keeps the unlocked state alive. The element is one the
 * caller owns, such as a `<video>` element, or one the player creates. */
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
	/** The refusal of the last play or unlock, or null. A successful play
	 * clears it, so it always names the latest refusal. */
	lastPlayError = $state<PlayRefusal | null>(null)
	/** The source the consumer asked for. */
	source = $state<string | null>(null)

	#element: HTMLMediaElement | null = null
	#supplied: HTMLMediaElement | null
	#rate = $state(1)
	#unlocked = false
	#unlocking: Promise<boolean> | null = null
	#loaded: string | null = null

	/** Build a player. Pass an element the caller owns to drive it, or
	 * nothing to let the player create its own audio element. */
	constructor(options?: AudioPlayerOptions) {
		this.#supplied = options?.element ?? null
	}

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
	 * unlock or play returns false and never throws. A refusal sets
	 * lastPlayError with the browser name and message, and a success
	 * clears it. */
	async play(source?: string): Promise<boolean> {
		const target = source ?? this.source
		if (!target) {
			this.lastPlayError = { name: "NoSourceError", message: "No source to play." }
			return false
		}
		if (!(await this.unlock())) return false
		if (target !== this.#loaded) this.load(target)
		const element = this.#element
		if (!element) {
			this.lastPlayError = { name: "UnknownError", message: "No element to play." }
			return false
		}
		try {
			await element.play()
			this.lastPlayError = null
			return true
		} catch (error) {
			this.lastPlayError = toRefusal(error)
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

	/** Build or adopt the element on first use, so no import touches the
	 * DOM. A caller-supplied element keeps the settings its markup gave it,
	 * and the player only applies its own rate and listeners. */
	#ensureElement(): HTMLMediaElement {
		if (this.#element) return this.#element
		if (this.#supplied) {
			const adopted = this.#supplied
			adopted.playbackRate = this.#rate
			this.#listen(adopted)
			this.#element = adopted
			return adopted
		}
		const element = new Audio()
		element.setAttribute("playsinline", "")
		element.preload = "metadata"
		element.playbackRate = this.#rate
		this.#listen(element)
		this.#element = element
		return element
	}

	/** Read an element's clock, timeline, buffer, and failures into the
	 * published state. The same set of listeners serves an element the
	 * caller owns and one the player created. */
	#listen(element: HTMLMediaElement): void {
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
	}

	/** Play a silent clip inside the gesture, then rewind and restore the
	 * mute state the element carried. A muted clip unlocks a mobile browser,
	 * and the rewind hides the clip from the user. An element the caller
	 * muted in its own markup comes out of the prime as it went in. A
	 * refusal sets lastPlayError, and a success clears it. */
	async #prime(element: HTMLMediaElement): Promise<boolean> {
		this.#loaded = silentClip
		const mutedBefore = element.muted
		element.muted = true
		element.src = silentClip
		try {
			await element.play()
			element.pause()
			element.currentTime = 0
			element.muted = mutedBefore
			this.#unlocked = true
			this.lastPlayError = null
			return true
		} catch (error) {
			element.muted = mutedBefore
			this.lastPlayError = toRefusal(error)
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
		/* An error that lands on an element which still plays needs one
		 * question first: did the source die, or only the sink? The element
		 * state cannot answer it, because a fatal fault in bytes the browser
		 * is still reading also lands mid play with the element unpaused and
		 * its clock moving. Code 1 is an abort, which a source swap causes and
		 * no user sees, and code 2 names the transfer, never the sink, so both
		 * keep the classify path. For the rest the error's own words are the
		 * evidence: a sink loss carries the browser's audio sink fault name,
		 * while a source fault names the decoder or the pipeline. Only the
		 * sink name takes the output branch, where the element keeps playing
		 * and the bytes stay out of question. Every other still playing error
		 * keeps today's classify path and clears playing. */
		if (!media || !source || media.code === 1) return

		if (
			!element.paused &&
			element.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE &&
			media.code !== 2 &&
			media.message.includes(SINK_FAULT)
		) {
			this.error = { failure: "output", message: media.message }
			return
		}
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
