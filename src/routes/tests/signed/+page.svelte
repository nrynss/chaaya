<script lang="ts">
	import { onMount } from "svelte"
	import { AudioPlayer } from "$lib/audio/playback/player.svelte"

	const player = new AudioPlayer()
	/** The source the expiry check plays. The player resolves it again on
	 * recovery, so it stays a function rather than a fixed string. */
	const entry = "/tests/signed/entry"

	let hydrated = $state(false)
	let source = $state(entry)
	let seekSeconds = $state(0)
	let refused = $state(false)

	onMount(() => {
		hydrated = true
	})

	async function play(): Promise<void> {
		refused = !(await player.play(source))
	}

	const spans = $derived(
		player.buffered.map((span) => `${span.start.toFixed(3)} to ${span.end.toFixed(3)}`).join(", ")
	)

	/** Point recovery at the entry route, which mints a fresh signature
	 * on every visit. It answers the source the input names, so the run
	 * the check plays keeps its own token. */
	function enableRecovery(): void {
		player.resolveSource = () => source
	}

	/** Point recovery at a signature that never validates, with a budget
	 * of one, so the run spends its budget at once. */
	function refuseRecovery(): void {
		player.resolveBudget = 1
		player.resolveSource = () => "/tests/signed/media?token=expired"
	}
</script>

<main>
	<h1>Signed expiry harness</h1>
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
	<button type="button" data-testid="recover" disabled={!hydrated} onclick={enableRecovery}>
		Enable recovery
	</button>
	<button type="button" data-testid="refuse" disabled={!hydrated} onclick={refuseRecovery}>
		Refuse recovery
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
		<dt>Failure</dt>
		<dd data-testid="failure">{player.error ? player.error.failure : "none"}</dd>
		<dt>Message</dt>
		<dd data-testid="message">{player.error ? player.error.message : ""}</dd>
		<dt>Recoveries</dt>
		<dd data-testid="recoveries">{player.recoveries}</dd>
		<dt>Buffered</dt>
		<dd data-testid="buffered">{spans}</dd>
		<dt>Refused</dt>
		<dd data-testid="refused">{refused}</dd>
	</dl>
</main>
