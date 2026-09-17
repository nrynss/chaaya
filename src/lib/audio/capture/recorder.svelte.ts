import { CAPTURE_PROCESSOR_NAME, CAPTURE_PROCESSOR_SOURCE } from "./pcm-worklet.js"
import { resampleChunks } from "./resample.js"
import { nextState } from "./state.js"
import type { CaptureChunk, CaptureMode, CaptureOptions, CaptureResult, CaptureState } from "./types.js"
import { encodeWav } from "./wav.js"

/**
 * The container types a browser may accept for a compressed take, best first.
 * Opus inside webm is the widest, and the mp4 pair covers a browser that
 * writes no webm.
 */
const COMPRESSED_TYPES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4;codecs=mp4a.40.2",
	"audio/mp4",
] as const

/** The PCM block size in frames when a caller names none. */
const DEFAULT_CHUNK_FRAMES = 4096

/** How long a take runs before it stops itself when a caller names none. */
const DEFAULT_AUTO_STOP_SECONDS = 12

/** The device sample rate to assume when the track reports none. */
const FALLBACK_SAMPLE_RATE = 48000

/** The compressed block interval in milliseconds, so chunks arrive mid take. */
const COMPRESSED_TIMESLICE_MS = 1000

/** The longest a stop waits for the audio thread to hand back its last block. */
const FLUSH_TIMEOUT_MS = 1000

/** How often a running take rechecks its tracks. A stopped track sets its own
 * state without an event, so the take has to look for itself. */
const TRACK_CHECK_MS = 250

interface WorkletChunk {
	samples: Float32Array
	offset: number
	contextTime: number
	final: boolean
}

interface AudioContextScope {
	AudioContext?: typeof AudioContext
	webkitAudioContext?: typeof AudioContext
}

function isWorkletChunk(value: unknown): value is WorkletChunk {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as WorkletChunk).samples instanceof Float32Array
	)
}

function isDenied(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { name?: unknown }).name === "NotAllowedError"
	)
}

function pickCompressedType(): string | null {
	if (typeof MediaRecorder === "undefined") return null
	if (typeof MediaRecorder.isTypeSupported !== "function") return null
	for (const type of COMPRESSED_TYPES) {
		if (MediaRecorder.isTypeSupported(type)) return type
	}
	return null
}

function readSampleRate(stream: MediaStream): number {
	const track = stream.getAudioTracks()[0]
	return track?.getSettings?.().sampleRate ?? FALLBACK_SAMPLE_RATE
}

/**
 * Records microphone audio through one of two modes. The compressed mode uses
 * MediaRecorder, the PCM mode runs an AudioWorklet, and both share one
 * lifecycle.
 *
 * The microphone opens only inside a gesture, because the browser grants
 * capture from a user action. Nothing here touches a browser global at import
 * time, so the module stays safe to evaluate on a server.
 *
 * A caller may supply the context the PCM mode records on. The recorder
 * disconnects its nodes on stop and reset either way, and it closes only a
 * context it made.
 *
 * A PCM take can stream instead of accumulating. Pass a listener and it
 * receives every block as it arrives, at renderRate. Pass retain false and
 * the recorder drops each block after the listener returns, so chunks stays
 * empty and result is null. Drain the blocks into an upload during capture,
 * and build a file from the same blocks with resampling and WAV encoding
 * when a file is needed.
 */
export class AudioRecorder {
	/** The capture mode this recorder writes with. */
	readonly mode: CaptureMode
	/** The lifecycle state of the recorder. */
	state = $state<CaptureState>("idle")
	/** The seconds left before the take stops itself. */
	countdown = $state(0)
	/** The number of blocks captured so far. */
	chunkCount = $state(0)
	/** The finished take, or null before a stop. */
	result = $state<CaptureResult | null>(null)
	/**
	 * The rate blocks arrive at, in hertz. A browser may render at the
	 * device rate rather than the rate the take declares.
	 */
	get renderRate(): number {
		return this.#renderRate
	}
	/** The error behind a denied or failed state, or null. */
	error = $state<unknown>(null)

	#stream: MediaStream | null = null
	#context: AudioContext | null = null
	#worklet: AudioWorkletNode | null = null
	#links: AudioNode[] = []
	#mediaRecorder: MediaRecorder | null = null
	#blocks: CaptureChunk[] = []
	#parts: Blob[] = []
	#ticker: ReturnType<typeof setInterval> | null = null
	#timer: ReturnType<typeof setTimeout> | null = null
	#sampleRate = FALLBACK_SAMPLE_RATE
	#renderRate = $state(FALLBACK_SAMPLE_RATE)
	#autoStop: number
	#chunkFrames: number
	#constraints: MediaTrackConstraints
	#suppliedContext: AudioContext | null = null
	#onChunk: ((chunk: CaptureChunk) => void) | null = null
	#retain: boolean
	#closing = false
	#session = 0
	#awaitStop: (() => void) | null = null
	#flushed: (() => void) | null = null
	#trackWatch: ReturnType<typeof setInterval> | null = null

	constructor(options: CaptureOptions = {}) {
		this.mode = options.mode ?? "compressed"
		this.#suppliedContext = options.context ?? null
		this.#autoStop = options.autoStopSeconds ?? DEFAULT_AUTO_STOP_SECONDS
		this.#chunkFrames = options.chunkFrames ?? DEFAULT_CHUNK_FRAMES
		this.#onChunk = options.onChunk ?? null
		this.#retain = options.retain ?? true
		this.#constraints = {
			echoCancellation: options.echoCancellation ?? true,
			noiseSuppression: options.noiseSuppression ?? true,
			autoGainControl: options.autoGainControl ?? true,
		}
	}

	/**
	 * The PCM blocks captured so far, in order. A compressed take holds none.
	 * Empty too under retain false, because the recorder drops every block
	 * after its listener returns. Read the block count from chunkCount, which
	 * counts arrivals either way.
	 */
	get chunks(): readonly CaptureChunk[] {
		void this.chunkCount
		return this.#blocks
	}

	/** The span of one block in seconds, the tolerance a duration check allows. */
	get chunkSeconds(): number {
		if (this.mode === "pcm") return this.#chunkFrames / this.#sampleRate
		return COMPRESSED_TIMESLICE_MS / 1000
	}

	/** Opens the microphone and starts a take. Call this from a user gesture. */
	async start(): Promise<void> {
		if (this.state === "requesting" || this.state === "recording") return
		this.#session += 1
		const session = this.#session
		this.#clearData()
		this.#closing = false
		this.state = nextState(this.state, "start")
		this.error = null
		try {
			const stream = await this.#openMicrophone()
			if (session !== this.#session) {
				for (const track of stream.getTracks()) track.stop()
				return
			}
			this.#stream = stream
			this.#sampleRate = readSampleRate(stream)
			// Watch the tracks before startup, so a track lost during the awaits still fails.
			this.#watchTracks(stream, session)
			this.#beginTrackWatch(session)
			if (this.state !== "requesting") return
			if (this.mode === "pcm") await this.#startPcm(stream, session)
			else this.#startCompressed(stream, session)
			if (session !== this.#session || this.state !== "requesting") return
			// A track can reach ended without firing an event, so recheck after startup.
			if (this.#tracksEnded()) {
				this.#trackLost(session)
				return
			}
			this.state = nextState(this.state, "granted")
			this.#beginCountdown()
		} catch (error) {
			if (session !== this.#session || this.state !== "requesting") return
			this.#release()
			this.error = error
			this.state = nextState(this.state, isDenied(error) ? "denied" : "failed")
		}
	}

	/** Ends the take and resolves once the recording is ready or has failed. */
	stop(): Promise<void> {
		if (this.state !== "recording") return Promise.resolve()
		const done = new Promise<void>((resolve) => {
			this.#awaitStop = resolve
		})
		this.#closing = true
		this.#stopCountdown()
		if (this.mode === "pcm") void this.#stopPcm()
		else if (this.#mediaRecorder?.state === "recording") this.#mediaRecorder.stop()
		else this.#resolveStop()
		return done
	}

	/** Drops any take and returns the recorder to idle with no recording. */
	reset(): void {
		this.#session += 1
		this.#closing = true
		if (this.#mediaRecorder?.state === "recording") this.#mediaRecorder.stop()
		this.#release()
		this.#clearData()
		this.error = null
		this.state = nextState(this.state, "reset")
		this.#resolveStop()
		this.#closing = false
	}

	async #openMicrophone(): Promise<MediaStream> {
		const media = globalThis.navigator?.mediaDevices
		if (!media?.getUserMedia) throw new Error("This browser cannot reach a microphone.")
		return media.getUserMedia({ audio: this.#constraints })
	}

	#startCompressed(stream: MediaStream, session: number): void {
		const type = pickCompressedType()
		if (!type) throw new Error("This browser cannot encode a recording.")
		const recorder = new MediaRecorder(stream, { mimeType: type })
		this.#mediaRecorder = recorder
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				this.#parts.push(event.data)
				this.chunkCount = this.#parts.length
			}
		}
		recorder.onerror = () => {
			if (session !== this.#session) return
			this.#fail(new Error("The microphone stopped before the take ended."))
		}
		recorder.onstop = () => {
			if (session !== this.#session) return
			this.#release()
			const mimeType = recorder.mimeType || type
			// A failed take keeps its parts, so build the blob before the state moves.
			this.#buildResult(new Blob(this.#parts, { type: mimeType }), mimeType)
			this.state = nextState(this.state, "finished")
			this.#resolveStop()
		}
		recorder.start(COMPRESSED_TIMESLICE_MS)
	}

	async #startPcm(stream: MediaStream, session: number): Promise<void> {
		const supplied = this.#suppliedContext
		const context = supplied ?? this.#openContext()
		this.#renderRate = context.sampleRate
		const module = URL.createObjectURL(
			new Blob([CAPTURE_PROCESSOR_SOURCE], { type: "text/javascript" })
		)
		try {
			await context.audioWorklet.addModule(module)
		} finally {
			URL.revokeObjectURL(module)
		}
		const source = context.createMediaStreamSource(stream)
		const worklet = new AudioWorkletNode(context, CAPTURE_PROCESSOR_NAME, {
			processorOptions: { chunkFrames: this.#chunkFrames },
		})
		worklet.port.onmessage = (event) => {
			if (session === this.#session) this.#onWorkletMessage(event.data)
		}
		const mute = context.createGain()
		mute.gain.value = 0
		source.connect(worklet)
		worklet.connect(mute)
		mute.connect(context.destination)
		this.#worklet = worklet
		this.#links = [source, mute]
		await context.resume()
	}

	#openContext(): AudioContext {
		const scope = globalThis as unknown as AudioContextScope
		const Context = scope.AudioContext ?? scope.webkitAudioContext
		if (!Context) throw new Error("This browser cannot open an audio context.")
		const context = new Context({ sampleRate: this.#sampleRate })
		this.#context = context
		return context
	}
	#onWorkletMessage(data: unknown): void {
		if (!isWorkletChunk(data)) return
		if (data.samples.length > 0) {
			const chunk: CaptureChunk = {
				samples: data.samples,
				offset: data.offset,
				contextTime: data.contextTime,
			}
			// The listener runs on this thread, without an await, so a slow
			// listener stalls the take the way slow rendering would. Hand the
			// block on and return. A throwing listener still surfaces, but the
			// take keeps the block and the count stays honest either way.
			try {
				this.#onChunk?.(chunk)
			} finally {
				if (this.#retain) this.#blocks.push(chunk)
				this.chunkCount += 1
			}
		}
		if (data.final) {
			const resolve = this.#flushed
			this.#flushed = null
			resolve?.()
		}
	}

	async #stopPcm(): Promise<void> {
		const worklet = this.#worklet
		if (!worklet) {
			this.#release()
			this.#resolveStop()
			return
		}
		await new Promise<void>((resolve) => {
			const guard = setTimeout(() => {
				this.#flushed = null
				resolve()
			}, FLUSH_TIMEOUT_MS)
			this.#flushed = () => {
				clearTimeout(guard)
				resolve()
			}
			worklet.port.postMessage("stop")
		})
		this.#release()
		// A streaming take dropped every block after its listener returned,
		// so there is nothing left to encode and the result stays null. The
		// caller holds the audio.
		if (!this.#retain) {
			this.state = nextState(this.state, "finished")
			this.#resolveStop()
			return
		}
		const blob = encodeWav(
			resampleChunks(this.#blocks, this.#renderRate, this.#sampleRate),
			this.#sampleRate
		)
		this.#finish(blob, "audio/wav")
	}

	#watchTracks(stream: MediaStream, session: number): void {
		const note = (): void => this.#trackLost(session)
		for (const track of stream.getAudioTracks()) {
			// A track that already ended must fail the take, because its event is gone.
			if (track.readyState === "ended") note()
			else track.addEventListener("ended", note)
		}
	}

	#beginTrackWatch(session: number): void {
		this.#trackWatch = setInterval(() => {
			if (this.#tracksEnded()) this.#trackLost(session)
		}, TRACK_CHECK_MS)
	}

	#tracksEnded(): boolean {
		const tracks = this.#stream?.getAudioTracks() ?? []
		return tracks.some((track) => track.readyState === "ended")
	}

	#trackLost(session: number): void {
		if (session !== this.#session) return
		if (this.#closing) return
		if (this.state !== "requesting" && this.state !== "recording") return
		this.#fail(new Error("The microphone left before the take ended."))
	}

	#fail(error: Error): void {
		this.#closing = true
		this.#stopCountdown()
		if (this.#mediaRecorder?.state === "recording") this.#mediaRecorder.stop()
		// A failed take keeps what it captured, so encode the blocks it holds.
		// A streaming take holds none, so it ends with no result.
		if (this.mode === "pcm" && this.#retain && this.#blocks.length > 0) {
			this.#buildResult(
				encodeWav(
					resampleChunks(this.#blocks, this.#renderRate, this.#sampleRate),
					this.#sampleRate
				),
				"audio/wav"
			)
		}
		this.#release()
		this.error = error
		this.state = nextState(this.state, "failed")
		this.#resolveStop()
	}

	#buildResult(blob: Blob, mimeType: string): void {
		this.result = { blob, mimeType, sampleRate: this.#sampleRate }
	}

	#finish(blob: Blob, mimeType: string): void {
		this.#buildResult(blob, mimeType)
		this.state = nextState(this.state, "finished")
		this.#resolveStop()
	}

	#beginCountdown(): void {
		if (this.#autoStop <= 0) return
		this.countdown = this.#autoStop
		this.#ticker = setInterval(() => {
			this.countdown = this.countdown > 0 ? this.countdown - 1 : 0
		}, 1000)
		this.#timer = setTimeout(() => {
			if (this.state === "recording") void this.stop()
		}, this.#autoStop * 1000)
	}

	#stopCountdown(): void {
		if (this.#ticker !== null) clearInterval(this.#ticker)
		if (this.#timer !== null) clearTimeout(this.#timer)
		this.#ticker = null
		this.#timer = null
		this.countdown = 0
	}

	#resolveStop(): void {
		const resolve = this.#awaitStop
		this.#awaitStop = null
		resolve?.()
	}

	#clearData(): void {
		this.#blocks = []
		this.#parts = []
		this.chunkCount = 0
		this.result = null
	}

	#release(): void {
		this.#stopCountdown()
		if (this.#trackWatch !== null) clearInterval(this.#trackWatch)
		this.#trackWatch = null
		if (this.#worklet) this.#worklet.port.onmessage = null
		this.#worklet = null
		for (const link of this.#links) link.disconnect()
		this.#links = []
		// A supplied context stays open, so a caller keeps the clock it
		// plays on. Only a context the recorder made closes here.
		if (this.#context) void this.#context.close().catch(() => undefined)
		this.#context = null
		if (this.#stream) {
			for (const track of this.#stream.getTracks()) track.stop()
		}
		this.#stream = null
		this.#mediaRecorder = null
	}
}
