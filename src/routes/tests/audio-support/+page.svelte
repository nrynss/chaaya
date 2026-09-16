<script lang="ts">
	import { onMount } from "svelte"
	import {
		buildGeneratedStream,
		installGeneratedMicrophone,
		recordGeneratedTake,
		type GeneratedTake
	} from "../../../../tests/playwright/support/audio/input"

	/** The marker a gap take leaves out. The index sits well inside the recorded
	 * window, so the take's tail cannot change the count. */
	const OMITTED_MARKER_INDEX = 5

	let hydrated = $state(false)
	let phase = $state<"idle" | "recording" | "done" | "failed">("idle")
	let failure = $state("")
	let take = $state<GeneratedTake | null>(null)
	let streamState = $state("")
	let streamTracks = $state(0)
	let microphoneState = $state("")
	let microphoneTracks = $state(0)

	onMount(() => {
		hydrated = true
	})

	async function record(omitMarkerIndex?: number): Promise<void> {
		phase = "recording"
		failure = ""
		take = null
		;(window as Window & { __take?: GeneratedTake }).__take = undefined
		try {
			const recorded = await recordGeneratedTake(
				omitMarkerIndex === undefined ? {} : { omitMarkerIndex }
			)
			take = recorded
			;(window as Window & { __take?: GeneratedTake }).__take = recorded
			phase = "done"
		} catch (error) {
			failure = String(error)
			phase = "failed"
		}
	}

	async function buildStream(): Promise<void> {
		streamState = "building"
		try {
			const generated = await buildGeneratedStream()
			streamTracks = generated.stream.getAudioTracks().length
			streamState = generated.stream.active ? "active" : "inactive"
			generated.stop()
		} catch (error) {
			streamState = `failed: ${String(error)}`
		}
	}

	async function readMicrophone(): Promise<void> {
		microphoneState = "reading"
		const microphone = installGeneratedMicrophone()
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
			microphoneTracks = stream.getAudioTracks().length
			microphoneState = stream.active ? "active" : "inactive"
		} catch (error) {
			microphoneState = `failed: ${String(error)}`
		} finally {
			microphone.restore()
		}
	}
</script>

<main>
	<h1>Audio support harness</h1>
	<p data-testid="phase">{phase}</p>
	<p data-testid="failure">{failure}</p>
	<p data-testid="mime">{take?.mimeType ?? ""}</p>
	<p data-testid="rate">{take?.sampleRate ?? 0}</p>
	<p data-testid="elapsed">{take?.elapsedSeconds ?? 0}</p>
	<p data-testid="markers">{take?.expectedMarkers ?? 0}</p>
	<button type="button" data-testid="record" disabled={!hydrated} onclick={() => record()}>
		Record take
	</button>
	<button
		type="button"
		data-testid="record-gap"
		disabled={!hydrated}
		onclick={() => record(OMITTED_MARKER_INDEX)}
	>
		Record take with a marker left out
	</button>
	<p data-testid="stream-state">{streamState}</p>
	<p data-testid="stream-tracks">{streamTracks}</p>
	<p data-testid="microphone-state">{microphoneState}</p>
	<p data-testid="microphone-tracks">{microphoneTracks}</p>
	<button type="button" data-testid="stream" disabled={!hydrated} onclick={buildStream}>
		Build a generated stream
	</button>
	<button type="button" data-testid="microphone" disabled={!hydrated} onclick={readMicrophone}>
		Read the generated microphone
	</button>
</main>
