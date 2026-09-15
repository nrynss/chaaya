<script lang="ts">
	import { onMount } from "svelte"
	import { AudioPlayer } from "$lib/audio/playback/player.svelte"

	const player = new AudioPlayer()

	let hydrated = $state(false)
	let source = $state("/tests/audio-playback/media/tone.wav")
	let seekSeconds = $state(0)
	let refused = $state(false)

	/* A click on a server rendered button does nothing until hydration
	 * attaches the handler. The buttons stay disabled until then, so a test
	 * that clicks one waits for hydration instead of racing it. */
	onMount(() => {
		hydrated = true
	})

	async function play(): Promise<void> {
		refused = !(await player.play(source))
	}

	const spans = $derived(
		player.buffered
			.map((span) => `${span.start.toFixed(3)} to ${span.end.toFixed(3)}`)
			.join(", ")
	)
</script>

<main>
	<h1>Audio playback</h1>
	<p>
		<label for="source">Source</label>
		<input id="source" data-testid="source" bind:value={source} />
	</p>
	<button type="button" data-testid="load" disabled={!hydrated} onclick={() => player.load(source)}>
		Load
	</button>
	<button type="button" data-testid="play" disabled={!hydrated} onclick={play}>Play</button>
	<button type="button" data-testid="pause" disabled={!hydrated} onclick={() => player.pause()}>
		Pause
	</button>
	<p>
		<label for="seek">Seek seconds</label>
		<input
			id="seek"
			data-testid="seek-target"
			type="number"
			min="0"
			step="0.5"
			bind:value={seekSeconds}
		/>
		<button type="button" data-testid="seek" disabled={!hydrated} onclick={() => player.seek(seekSeconds)}>
			Seek
		</button>
	</p>
	<dl>
		<dt>Playing</dt>
		<dd data-testid="playing">{player.playing}</dd>
		<dt>Current time</dt>
		<dd data-testid="current-time">{player.currentTime}</dd>
		<dt>Duration</dt>
		<dd data-testid="duration">{player.duration}</dd>
		<dt>Buffered</dt>
		<dd data-testid="buffered">{spans}</dd>
		<dt>Loaded</dt>
		<dd data-testid="loaded">{player.source ? player.source : ""}</dd>
		<dt>Rate</dt>
		<dd data-testid="rate">{player.rate}</dd>
		<dt>Failure</dt>
		<dd data-testid="failure">{player.error ? player.error.failure : "none"}</dd>
		<dt>Message</dt>
		<dd data-testid="message">{player.error ? player.error.message : ""}</dd>
		<dt>Refused</dt>
		<dd data-testid="refused">{refused}</dd>
	</dl>
</main>
