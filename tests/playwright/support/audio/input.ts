/**
 * A generated audio input for the browser checks. The page builds the signal
 * itself, so no check ever opens a microphone.
 *
 * The signal is one continuous tone with a short marker burst every marker
 * interval. A marker is loud, so a reader finds each burst by its level. The
 * marker interval and the marker length are fixed, which lets a reader report
 * the spacing between bursts and the order they arrive in.
 *
 * Every helper here runs inside the page. None of them touches a browser global
 * at import time, so the module stays safe to evaluate on a server.
 */

/** The fixed shape of the generated signal. A caller overrides only what a
 * given check needs. */
export interface GeneratedInputOptions {
	/** The audio rate of the source and of the take. 48000 by default. */
	readonly sampleRate?: number
	/** A context shared with the recorder, so source and capture use one clock. */
	readonly context?: AudioContext
	/** Hold the signal until the consumer has finished connecting its nodes. */
	readonly deferStart?: boolean
	/** Send a quiet pilot tone until start, so a separate capture clock can observe input. */
	readonly primeTransport?: boolean
	/** The length of the generated signal in seconds. 1.5 by default. */
	readonly totalSeconds?: number
	/** The frequency of the continuous tone in hertz. 220 by default. */
	readonly toneHz?: number
	/** The frequency of the marker burst in hertz. 2000 by default. */
	readonly markerHz?: number
	/** The level of the continuous tone from 0 to 1. 0.25 by default. */
	readonly toneAmplitude?: number
	/** The level added while a marker sounds from 0 to 1. 0.9 by default. */
	readonly markerAmplitude?: number
	/** The gap between marker onsets in milliseconds. 100 by default. */
	readonly markerIntervalMs?: number
	/** The length of one marker burst in milliseconds. 25 by default. */
	readonly markerMs?: number
	/** The marker a take leaves out, so a reader sees a gap. None by default. */
	readonly omitMarkerIndex?: number
	/** How long a take records in seconds. 1.6 by default. */
	readonly recordSeconds?: number
	/** The container a take records into. The helper picks one when absent. */
	readonly mimeType?: string
}

/** The markers a signal carries, and where each one starts. */
interface ResolvedInput {
	sampleRate: number
	totalSeconds: number
	toneHz: number
	markerHz: number
	toneAmplitude: number
	markerAmplitude: number
	markerIntervalMs: number
	markerMs: number
	omitMarkerIndex: number
	recordSeconds: number
	mimeType: string | undefined
}

/** The recorder block interval in milliseconds, so a take arrives mid run. */
const RECORD_BLOCK_MS = 200

/** The container types a take may record into, best first. Opus inside webm
 * is the widest, and the ogg and mp4 entries cover a browser without webm. */
const RECORDABLE_TYPES = [
	"audio/webm;codecs=opus",
	"audio/ogg;codecs=opus",
	"audio/webm",
	"audio/mp4"
] as const

/** The values a caller leaves unset. The take records past the signal's end,
 * so a late take never clips the last marker. */
const DEFAULTS = {
	sampleRate: 48000,
	totalSeconds: 1.5,
	toneHz: 220,
	markerHz: 2000,
	toneAmplitude: 0.25,
	markerAmplitude: 0.9,
	markerIntervalMs: 100,
	markerMs: 25,
	omitMarkerIndex: -1,
	recordSeconds: 1.6
} as const

/** The span of one recorder block in seconds. A take carries this as the
 * tolerance for a check that compares its samples against the page clock. */
const RECORD_BLOCK_SECONDS = RECORD_BLOCK_MS / 1000

function resolveInput(options: GeneratedInputOptions): ResolvedInput {
	return {
		sampleRate: options.sampleRate ?? DEFAULTS.sampleRate,
		totalSeconds: options.totalSeconds ?? DEFAULTS.totalSeconds,
		toneHz: options.toneHz ?? DEFAULTS.toneHz,
		markerHz: options.markerHz ?? DEFAULTS.markerHz,
		toneAmplitude: options.toneAmplitude ?? DEFAULTS.toneAmplitude,
		markerAmplitude: options.markerAmplitude ?? DEFAULTS.markerAmplitude,
		markerIntervalMs: options.markerIntervalMs ?? DEFAULTS.markerIntervalMs,
		markerMs: options.markerMs ?? DEFAULTS.markerMs,
		omitMarkerIndex: options.omitMarkerIndex ?? DEFAULTS.omitMarkerIndex,
		recordSeconds: options.recordSeconds ?? DEFAULTS.recordSeconds,
		mimeType: options.mimeType
	}
}

function wait(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>()
	setTimeout(resolve, ms)
	return promise
}

function pickMimeType(): string | null {
	if (typeof MediaRecorder === "undefined") return null
	if (typeof MediaRecorder.isTypeSupported !== "function") return null
	for (const type of RECORDABLE_TYPES) {
		if (MediaRecorder.isTypeSupported(type)) return type
	}
	return null
}

async function toBase64(blob: Blob): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer())
	let binary = ""
	const step = 0x8000
	for (let index = 0; index < bytes.length; index += step) {
		binary += String.fromCharCode(...bytes.subarray(index, index + step))
	}
	return btoa(binary)
}

/** The onset of every marker the signal carries, in seconds, with the omitted
 * marker left out. A check compares a reader's onsets against this list. */
export function markerOnsetsSeconds(options: GeneratedInputOptions = {}): number[] {
	const settings = resolveInput(options)
	const interval = settings.markerIntervalMs / 1000
	const onsets: number[] = []
	for (let index = 0; ; index += 1) {
		const onset = index * interval
		if (onset >= settings.totalSeconds) break
		if (index !== settings.omitMarkerIndex) onsets.push(onset)
	}
	return onsets
}

/** The mono frames of the generated signal, in the range -1 to 1. The pure
 * form lets a Node check build the same signal without a browser. */
export function generateSamples(options: GeneratedInputOptions = {}): Float32Array {
	const settings = resolveInput(options)
	const frames = Math.round(settings.totalSeconds * settings.sampleRate)
	const samples = new Float32Array(frames)
	const interval = settings.markerIntervalMs / 1000
	const markerSeconds = settings.markerMs / 1000
	for (let index = 0; index < frames; index += 1) {
		const time = index / settings.sampleRate
		const slot = Math.floor(time / interval)
		const inSlot = time - slot * interval
		let value = settings.toneAmplitude * Math.sin(2 * Math.PI * settings.toneHz * time)
		if (slot !== settings.omitMarkerIndex && inSlot < markerSeconds) {
			value += settings.markerAmplitude * Math.sin(2 * Math.PI * settings.markerHz * time)
		}
		samples[index] = value
	}
	return samples
}

/** A live generated source inside the page. The stream carries the signal, and
 * the elapsed time comes from the context that renders it. */
export interface GeneratedStream {
	/** The stream a recorder or a meter consumes in place of a microphone. */
	readonly stream: MediaStream
	/** Starts the source once, after the consumer connects. */
	start(): void
	/** Seconds since the source started, read from this context's clock. */
	elapsedSeconds(): number
	/** This context's clock reading in seconds. */
	contextSeconds(): number
	/** Stops the source and releases the context. */
	stop(): void
}

/** Builds a source from an AudioBufferSourceNode through a
 * MediaStreamAudioDestinationNode, and hands back its stream. One clock reads
 * the elapsed time, so no check falls back to a wall clock. */
export async function buildGeneratedStream(
	options: GeneratedInputOptions = {}
): Promise<GeneratedStream> {
	const settings = resolveInput(options)
	const context = options.context ?? new AudioContext({ sampleRate: settings.sampleRate })
	await context.resume()
	return createGeneratedStream(options, context)
}

/** Connects the generated nodes synchronously when a recorder creates its context. */
function createGeneratedStream(options: GeneratedInputOptions, context: AudioContext): GeneratedStream {
	const settings = resolveInput(options)
	const samples = generateSamples(settings)
	// Keep the readiness pilot separate from the signal so ending the pilot
	// never changes the signal buffer's playback position.
	const pilotFrames = options.primeTransport ? Math.round(settings.sampleRate / 10) : 0
	const pilotBuffer = context.createBuffer(1, Math.max(1, pilotFrames), settings.sampleRate)
	const pilot = pilotBuffer.getChannelData(0)
	for (let index = 0; index < pilotFrames; index += 1) {
		pilot[index] = 0.01 * Math.sin(2 * Math.PI * settings.toneHz * index / settings.sampleRate)
	}
	const pilotSource = context.createBufferSource()
	pilotSource.buffer = pilotBuffer
	const source = context.createBufferSource()
	const signalBuffer = context.createBuffer(1, samples.length, settings.sampleRate)
	signalBuffer.getChannelData(0).set(samples)
	source.buffer = signalBuffer
	const destination = context.createMediaStreamDestination()
	if (pilotFrames > 0) {
		pilotSource.loop = true
		pilotSource.loopEnd = pilotFrames / settings.sampleRate
		pilotSource.connect(destination)
		pilotSource.start()
	}
	source.connect(destination)
	let startedAt: number | null = null
	let pilotPlaying = pilotFrames > 0
	const start = (): void => {
		if (startedAt !== null) return
		startedAt = context.currentTime
		if (pilotPlaying) {
			pilotSource.stop()
			pilotPlaying = false
		}
		source.start()
	}
	if (!options.deferStart) start()
	return {
		stream: destination.stream,
		start,
		elapsedSeconds: () => startedAt === null ? 0 : context.currentTime - startedAt,
		contextSeconds: () => context.currentTime,
		stop: () => {
			if (pilotPlaying) {
				pilotSource.stop()
				pilotPlaying = false
			}
			if (startedAt !== null) source.stop()
			source.disconnect()
			pilotSource.disconnect()
			destination.disconnect()
			if (!options.context) void context.close()
		}
	}
}

/** A page patch that answers getUserMedia with the generated stream. A capture
 * harness calls this before it starts a recorder, so the recorder reads the
 * generated signal instead of a device. */
export interface GeneratedMicrophone {
	/** Move the deferred source onto a newly constructed capture context, keeping the granted stream. */
	bindContext(context: AudioContext): void
	/** Start the generated signal after the recorder connects. */
	start(): void
	/** Seconds since the last built source started. */
	elapsedSeconds(): number
	/** Restores getUserMedia and stops the source. */
	restore(): void
}

/** Replaces navigator.mediaDevices.getUserMedia with the generated input. Each
 * call builds a fresh source, so a second take starts from the signal top. */
export function installGeneratedMicrophone(
	options: GeneratedInputOptions = {}
): GeneratedMicrophone {
	const media = navigator.mediaDevices
	const original = media.getUserMedia.bind(media)
	let current: GeneratedStream | null = null
	media.getUserMedia = async () => {
		current?.stop()
		current = await buildGeneratedStream(options)
		return current.stream
	}
	return {
		bindContext: (context) => {
			if (!current) throw new Error("The generated microphone has no granted stream.")
			const stream = current.stream
			current.stop()
			for (const track of stream.getTracks()) {
				stream.removeTrack(track)
				track.stop()
			}
			const replacement = createGeneratedStream({ ...options, context }, context)
			for (const track of replacement.stream.getTracks()) stream.addTrack(track)
			current = { ...replacement, stream }
		},
		start: () => current?.start(),
		elapsedSeconds: () => current?.elapsedSeconds() ?? 0,
		restore: () => {
			media.getUserMedia = original
			current?.stop()
			current = null
		}
	}
}

/** One recorded take of the generated signal, ready for the Node marker
 * reader. The blob travels as base64, because a Playwright handle cannot carry
 * bytes across the page boundary. */
export interface GeneratedTake {
	readonly base64: string
	readonly mimeType: string
	readonly sampleRate: number
	/** The take length in seconds, read from the context's own clock. */
	readonly elapsedSeconds: number
	/** One recorder block in seconds, the clock comparison tolerance. */
	readonly blockSeconds: number
	readonly markerIntervalMs: number
	readonly markerMs: number
	readonly recordSeconds: number
	/** How many markers the recorded window should carry. */
	readonly expectedMarkers: number
}

/** Records the generated stream through MediaRecorder for the requested span.
 * The recorder under test receives this stream in place of a microphone. The
 * elapsed time comes from the context clock, never from the caller's timer. */
export async function recordGeneratedTake(
	options: GeneratedInputOptions = {}
): Promise<GeneratedTake> {
	const settings = resolveInput(options)
	const context = new AudioContext({ sampleRate: settings.sampleRate })
	await context.resume()
	const samples = generateSamples(settings)
	const buffer = context.createBuffer(1, samples.length, settings.sampleRate)
	buffer.getChannelData(0).set(samples)
	const source = context.createBufferSource()
	source.buffer = buffer
	const destination = context.createMediaStreamDestination()
	source.connect(destination)
	const mimeType = settings.mimeType ?? pickMimeType()
	if (!mimeType) throw new Error("This browser records no audio container.")
	const recorder = new MediaRecorder(destination.stream, { mimeType })
	const parts: Blob[] = []
	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) parts.push(event.data)
	}
	const { promise: stopped, resolve: resolveStopped } = Promise.withResolvers<void>()
	const { promise: started, resolve: resolveStarted } = Promise.withResolvers<void>()
	recorder.onstart = () => resolveStarted()
	recorder.onstop = () => resolveStopped()
	recorder.start(RECORD_BLOCK_MS)
	await started
	const startedAt = context.currentTime
	source.start()
	await wait(settings.recordSeconds * 1000)
	recorder.stop()
	await stopped
	const elapsedSeconds = context.currentTime - startedAt
	source.stop()
	const blob = new Blob(parts, { type: recorder.mimeType || mimeType })
	const base64 = await toBase64(blob)
	await context.close()
	const expectedMarkers = markerOnsetsSeconds(settings).filter(
		(onset) => onset + settings.markerMs / 1000 <= settings.recordSeconds
	).length
	return {
		base64,
		mimeType: recorder.mimeType || mimeType,
		sampleRate: settings.sampleRate,
		elapsedSeconds,
		blockSeconds: RECORD_BLOCK_SECONDS,
		markerIntervalMs: settings.markerIntervalMs,
		markerMs: settings.markerMs,
		recordSeconds: settings.recordSeconds,
		expectedMarkers
	}
}
