<script lang="ts">
	import { onMount } from "svelte"
	import {
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
</main>
