<script lang="ts">
	import type { CaptureMode, CaptureResult } from "$lib/audio/capture"
	import { AudioRecorder } from "$lib/audio/capture"
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

	let recorder = $state<AudioRecorder | null>(null)
	let microphone = $state<GeneratedMicrophone | null>(null)
	let startElapsed = $state(0)
	let stopElapsed = $state(0)
	let stream: MediaStream | null = null

	/** Answers the next grant with a refusal, the way a browser reports one. */
	function refuse(): void {
		navigator.mediaDevices.getUserMedia = () =>
			Promise.reject(new DOMException("The microphone grant was refused.", REFUSAL_NAME))
	}

	function start(mode: CaptureMode): void {
		startElapsed = 0
		stopElapsed = 0
		const next = new AudioRecorder({ mode, autoStopSeconds: TAKE_SECONDS })
		recorder = next
		void next.start()
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

	/* Build the generated microphone once, so every start reads the same
	 * signal at the same rate and no check touches a device. */
	$effect(() => {
		// The signal leaves its first marker out, so a take can open there
		// without cutting a burst in half.
		microphone = installGeneratedMicrophone({ omitMarkerIndex: 0 })
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
	<p data-testid="mode">{recorder?.mode ?? "none"}</p>
	<p data-testid="state">{recorder?.state ?? "idle"}</p>
	<p data-testid="chunks">{recorder?.chunkCount ?? 0}</p>
	<p data-testid="mime">{recorder?.result?.mimeType ?? ""}</p>
	<p data-testid="rate">{recorder?.result?.sampleRate ?? 0}</p>
	<p data-testid="size">{recorder?.result?.blob.size ?? 0}</p>
	<p data-testid="error">{recorder?.error ? String(recorder.error) : ""}</p>
	<p data-testid="block-seconds">{recorder?.chunkSeconds ?? 0}</p>
	<p data-testid="start-elapsed">{startElapsed}</p>
	<p data-testid="stop-elapsed">{stopElapsed}</p>
	<button data-testid="start-compressed" onclick={() => start("compressed")}>
		Record compressed
	</button>
	<button data-testid="start-pcm" onclick={() => start("pcm")}>Record pcm</button>
	<button
		data-testid="start-refused"
		onclick={() => {
			refuse()
			start("compressed")
		}}
	>
		Record with a refused grant
	</button>
	<button data-testid="stop" onclick={() => recorder?.stop()}>Stop</button>
	<button data-testid="stop-track" onclick={stopTrack}>Stop the track</button>
	<button data-testid="reset" onclick={clear}>Reset</button>
</main>
