<script lang="ts">
	import { page } from "$app/state"
	import type { CaptureChunk, CaptureMode, CaptureResult } from "$lib/audio/capture"
	import { AudioRecorder } from "$lib/audio/capture"
	import { ChunkUploader } from "$lib/audio/upload"
	import { sha256Hex } from "$lib/audio/upload/chunk.js"
	import { onMount } from "svelte"
	import {
		installGeneratedMicrophone,
		type GeneratedMicrophone
	} from "../../../../tests/playwright/support/audio/input"

	/** The shape the wrapper reads. The type lives in the browser's DOM
	 * library, which svelte-check resolves and eslint's globals list does
	 * not, so the alias spells out the member the page actually passes. */
	type StreamOptions = {
		audio?: { deviceId?: string } | boolean
		video?: boolean
	}

	/** How long a take runs before it stops itself. The generated signal runs
	 * shorter, so a take covers every marker the signal carries. */
	const TAKE_SECONDS = 2

	/** The name a browser gives the refusal of a microphone grant. */
	const REFUSAL_NAME = "NotAllowedError"

	/** How long a streaming take runs before it stops itself. A check stops
	 * it early or reloads mid take, so the span only bounds a runaway. */
	const STREAM_TAKE_SECONDS = 30

	/** The longest chunk the streaming check uploads with. Raw frames fill
	 * chunks fast, so a wide chunk keeps a short take under the fixture
	 * ceiling. */
	const STREAM_CHUNK_BYTES = 32768

	/** The owner every harness upload belongs to. */
	const STREAM_OWNER = "harness-owner"

	let recorder = $state<AudioRecorder | null>(null)
	let microphone = $state<GeneratedMicrophone | null>(null)
	let startElapsed = $state(0)
	let stopElapsed = $state(0)
	let stream: MediaStream | null = null
	let sharedContext: AudioContext | null = null
	let ownedContextState = $state("none")
	let probeTone = $state("")
	let probeFailure = $state("")
	let streamed = $state(0)
	let retained = $state(0)
	let streamDigest = $state("")
	let streamResult = $state("")
	let streamDone = $state(false)
	let uploadBase = $state("")
	let uploadId = $state("")
	let uploadReceipt = $state("")
	let uploadFailure = $state("")
	let resumed = $state(false)
	let streaming = false
	let streamBytes: Uint8Array<ArrayBuffer>[] = []
	let uploader: ChunkUploader | null = null

	/** Answers the next grant with a refusal, the way a browser reports one. */
	function refuse(): void {
		navigator.mediaDevices.getUserMedia = () =>
			Promise.reject(new DOMException("The microphone grant was refused.", REFUSAL_NAME))
	}

	async function start(mode: CaptureMode, refused = false): Promise<void> {
		startElapsed = 0
		stopElapsed = 0
		const owned = mode === "pcm" && page.url.searchParams.get("context") === "owned"
		const inputReady = Promise.withResolvers<void>()
		// Share the source clock in PCM mode. Worklet setup finishes before the signal starts.
		if (mode === "pcm") sharedContext = new AudioContext({ sampleRate: 48000 })
		microphone?.restore()
		microphone = installGeneratedMicrophone({
			omitMarkerIndex: 0,
			deferStart: true,
			primeTransport: owned,
			context: mode === "pcm" ? sharedContext ?? undefined : undefined
		})
		const media = navigator.mediaDevices
		const generated = media.getUserMedia.bind(media)
		media.getUserMedia = async (constraints?: StreamOptions) => {
			stream = await generated(constraints)
			return stream
		}
		if (refused) refuse()
		const next = new AudioRecorder({
			mode,
			onChunk: owned ? (chunk) => {
				if (chunk.samples.some((sample) => Math.abs(sample) > 0.001)) inputReady.resolve()
			} : undefined,
			context: mode === "pcm" && !owned
				? sharedContext ?? undefined : undefined,
			autoStopSeconds: TAKE_SECONDS
		})
		recorder = next
		const Context = globalThis.AudioContext
		if (owned) {
			// Keep native construction and ownership, while the generated stream uses its rendering clock.
			globalThis.AudioContext = new Proxy(Context, {
				construct(target, args) {
					const context = Reflect.construct(target, args) as AudioContext
					ownedContextState = context.state
					context.addEventListener("statechange", () => { ownedContextState = context.state })
					microphone?.bindContext(context)
					void sharedContext?.close()
					return context
				}
			})
		}
		try {
			await next.start()
		} finally {
			globalThis.AudioContext = Context
		}
		if (next.state === "recording") {
			// The generated transport can initially deliver silence while its graph connects.
			// Start markers only after the saved PCM path receives the pilot tone.
			if (owned) await inputReady.promise
			microphone?.start()
		}
	}

	/** Records the generated input on a context the page owns, in PCM mode.
	 * The recorder never closes that context, so the check below keeps it. */
	async function startShared(): Promise<void> {
		startElapsed = 0
		stopElapsed = 0
		probeTone = ""
		probeFailure = ""
		sharedContext = new AudioContext()
		const next = new AudioRecorder({ mode: "pcm", context: sharedContext, autoStopSeconds: TAKE_SECONDS })
		recorder = next
		await next.start()
		microphone?.start()
		startElapsed = microphone?.elapsedSeconds() ?? 0
	}

	/** Schedules one short tone on the shared context after a stop. A closed
	 * context rejects this, so a sounding tone proves the recorder left it
	 * open. */
	async function probeShared(): Promise<void> {
		const context = sharedContext
		if (!context) {
			probeFailure = "the page holds no shared context"
			return
		}
		try {
			await context.resume()
			const tone = context.createOscillator()
			const gain = context.createGain()
			gain.gain.value = 0.2
			tone.frequency.value = 440
			tone.connect(gain)
			gain.connect(context.destination)
			tone.start()
			tone.stop(context.currentTime + 0.1)
			await new Promise((resolve) => setTimeout(resolve, 150))
			probeTone = "sounded"
		} catch (error) {
			probeFailure = error instanceof Error ? error.message : String(error)
		}
	}

	function stopTrack(): void {
		for (const track of stream?.getAudioTracks() ?? []) track.stop()
	}

	function clear(): void {
		recorder?.reset()
		recorder = null
		stream = null
		startElapsed = 0
		stopElapsed = 0
	}

	/** Join the streamed raw frames into one buffer, in arrival order. */
	function joinedStream(): Uint8Array<ArrayBuffer> {
		let size = 0
		for (const part of streamBytes) size += part.byteLength
		const all = new Uint8Array(size)
		let offset = 0
		for (const part of streamBytes) {
			all.set(part, offset)
			offset += part.byteLength
		}
		return all
	}

	/** Hand one streamed block to the upload and to the page digest. */
	function onStreamBlock(chunk: CaptureChunk): void {
		const bytes = new Uint8Array(chunk.samples.slice().buffer as ArrayBuffer)
		streamBytes.push(bytes)
		streamed += 1
		retained = recorder?.chunks.length ?? 0
		uploader?.append(bytes)
	}

	/** Record PCM without retaining, and drain every block into an upload. */
	async function startStream(): Promise<void> {
		if (streaming) return
		streaming = true
		streamDigest = ""
		streamResult = ""
		uploadId = ""
		uploadReceipt = ""
		uploadFailure = ""
		resumed = false
		streamed = 0
		retained = 0
		streamDone = false
		streamBytes = []
		startElapsed = 0
		stopElapsed = 0
		const base = uploadBase
		if (base === "") {
			uploadFailure = "the page holds no upload target"
			streaming = false
			return
		}
		try {
			const next = new ChunkUploader({
				url: base,
				owner: STREAM_OWNER,
				contentType: "audio/x-pcm-f32le",
				chunkSize: STREAM_CHUNK_BYTES
			})
			uploader = next
			const take = new AudioRecorder({
				mode: "pcm",
				autoStopSeconds: STREAM_TAKE_SECONDS,
				retain: false,
				onChunk: onStreamBlock
			})
			recorder = take
			const opening = next.start()
			await take.start()
			// Do not let the generated signal run while the PCM worklet is loading.
			microphone?.start()
			startElapsed = microphone?.elapsedSeconds() ?? 0
			await opening
			if (next.state !== "streaming") {
				throw new Error(next.error?.message ?? "the upload did not open")
			}
			uploadId = next.id ?? ""
		} catch (error) {
			uploadFailure = error instanceof Error ? error.message : String(error)
			streaming = false
		}
	}

	/** Stop the streaming take, digest the streamed frames, and finish. */
	async function stopStream(): Promise<void> {
		try {
			await recorder?.stop()
			streamDigest = await sha256Hex(joinedStream())
			streamResult = recorder?.result === null ? "null" : "held"
			retained = recorder?.chunks.length ?? 0
			const next = uploader
			if (next === null) {
				uploadFailure = "the page holds no upload"
				return
			}
			await next.finish()
			if (next.state === "done") uploadReceipt = next.receipt?.sha256 ?? ""
			else uploadFailure = next.error?.message ?? "the upload did not finish"
		} catch (error) {
			uploadFailure = error instanceof Error ? error.message : String(error)
		} finally {
			streamDone = true
			streaming = false
		}
	}

	/** Pick up the upload a reloaded page left behind, and complete it. */
	async function resumeUpload(): Promise<void> {
		const next = await ChunkUploader.resume()
		if (next === undefined) return
		uploader = next
		resumed = true
		uploadId = next.id ?? ""
		await next.finish()
		if (next.state === "done") uploadReceipt = next.receipt?.sha256 ?? ""
		else uploadFailure = next.error?.message ?? "the upload did not finish"
		streamDone = true
	}

	onMount(() => {
		uploadBase = page.url.searchParams.get("upload") ?? ""
		void resumeUpload()
		return () => {
			microphone?.restore()
			void sharedContext?.close().catch(() => undefined)
		}
	})

	/* Install a deferred input for shared-context and streaming checks.
	 * Each capture starts it after the recorder has connected its nodes. */
	$effect(() => {
		// The signal leaves its first marker out, so a take can open there
		// without cutting a burst in half.
		microphone = installGeneratedMicrophone({ omitMarkerIndex: 0, deferStart: true })
		const media = navigator.mediaDevices
		const inner = media.getUserMedia.bind(media)
		media.getUserMedia = async (constraints?: StreamOptions) => {
			const opened = await inner(constraints)
			stream = opened
			return opened
		}
	})

	/* The take starts when the recorder enters its running state, so the clock
	 * reading at that moment bounds the audio the take holds. */
	$effect(() => {
		const state = recorder?.state
		if (state === "recording") startElapsed = microphone?.elapsedSeconds() ?? 0
		if (state === "stopped" || state === "failed") {
			stopElapsed = microphone?.elapsedSeconds() ?? 0
		}
	})

	$effect(() => {
		;(window as Window & { __capture?: CaptureResult }).__capture =
			recorder?.result ?? undefined
	})
</script>

<main>
	<h1>Audio capture harness</h1>
	<p data-testid="owned-context-state">{recorder?.state === "stopped" ? ownedContextState : "pending"}</p>
	<p data-testid="mode">{recorder?.mode ?? "none"}</p>
	<p data-testid="state">{recorder?.state ?? "idle"}</p>
	<p data-testid="chunks">{recorder?.chunkCount ?? 0}</p>
	<p data-testid="retained">{retained}</p>
	<p data-testid="streamed">{streamed}</p>
	<p data-testid="stream-digest">{streamDigest}</p>
	<p data-testid="stream-result">{streamResult}</p>
	<p data-testid="stream-done">{streamDone ? "yes" : "no"}</p>
	<p data-testid="upload-id">{uploadId}</p>
	<p data-testid="upload-receipt">{uploadReceipt}</p>
	<p data-testid="upload-failure">{uploadFailure}</p>
	<p data-testid="resumed">{resumed ? "yes" : "no"}</p>
	<p data-testid="render-rate">{recorder?.renderRate ?? 0}</p>
	<p data-testid="mime">{recorder?.result?.mimeType ?? ""}</p>
	<p data-testid="rate">{recorder?.result?.sampleRate ?? 0}</p>
	<p data-testid="size">{recorder?.result?.blob.size ?? 0}</p>
	<p data-testid="error">{recorder?.error ? String(recorder.error) : ""}</p>
	<p data-testid="block-seconds">{recorder?.chunkSeconds ?? 0}</p>
	<p data-testid="start-elapsed">{startElapsed}</p>
	<p data-testid="stop-elapsed">{stopElapsed}</p>
	<p data-testid="probe-tone">{probeTone}</p>
	<p data-testid="probe-failure">{probeFailure}</p>
	<button data-testid="start-compressed" onclick={() => start("compressed")}>
		Record compressed
	</button>
	<button data-testid="start-pcm" onclick={() => start("pcm")}>Record pcm</button>
	<button data-testid="start-shared" onclick={startShared}>Record on a shared context</button>
	<button data-testid="probe-shared" onclick={probeShared}>Probe the shared context</button>
	<button
		data-testid="start-refused"
		onclick={() => {
			void start("compressed", true)
		}}
	>
		Record with a refused grant
	</button>
	<button data-testid="stop" onclick={() => recorder?.stop()}>Stop</button>
	<button data-testid="stop-track" onclick={stopTrack}>Stop the track</button>
	<button data-testid="reset" onclick={clear}>Reset</button>
	<button data-testid="start-stream" onclick={() => void startStream()}>Record a stream</button>
	<button data-testid="stop-stream" onclick={() => void stopStream()}>Stop the stream</button>
</main>
