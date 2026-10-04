<script lang="ts">
	import { onMount } from "svelte"
	import { AudioPlayer } from "$lib/audio/playback/player.svelte"

	let video: HTMLVideoElement | undefined
	let player = $state<AudioPlayer | null>(null)
	let hydrated = $state(false)
	let source = $state("/tests/video-playback/media/clip.webm")
	let seekSeconds = $state(0)
	let refused = $state(false)
	let videoTime = $state(0)
	let videoPaused = $state(true)

	/* A click on a server rendered button does nothing until hydration
	 * attaches the handler. The buttons stay disabled until the player
	 * exists, so a test that clicks one waits instead of racing. The player
	 * adopts the markup element, the shape a caller owns. */
	onMount(() => {
		if (video) player = new AudioPlayer({ element: video })
		hydrated = true
	})

	async function play(): Promise<void> {
		if (!player) return
		refused = !(await player.play(source))
	}

	const spans = $derived(
		player
			? player.buffered
					.map((span) => `${span.start.toFixed(3)} to ${span.end.toFixed(3)}`)
					.join(", ")
			: ""
	)
</script>

<main>
	<h1>Video playback</h1>
	<video
		data-testid="video"
		bind:this={video}
		bind:currentTime={videoTime}
		bind:paused={videoPaused}
		playsinline
		preload="metadata"
		width="320"
		height="240"
	></video>
	<p>
		<label for="source">Source</label>
		<input id="source" data-testid="source" bind:value={source} />
	</p>
	<button type="button" data-testid="load" disabled={!player} onclick={() => player?.load(source)}>
		Load
	</button>
	<button type="button" data-testid="play" disabled={!player} onclick={play}>Play</button>
	<button type="button" data-testid="pause" disabled={!player} onclick={() => player?.pause()}>
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
		<button
			type="button"
			data-testid="seek"
			disabled={!player}
			onclick={() => player?.seek(seekSeconds)}
		>
			Seek
		</button>
	</p>
	<dl>
		<dt>Playing</dt>
		<dd data-testid="playing">{player ? player.playing : ""}</dd>
		<dt>Current time</dt>
		<dd data-testid="current-time">{player ? player.currentTime : ""}</dd>
		<dt>Element time</dt>
		<dd data-testid="video-time">{videoTime}</dd>
		<dt>Element paused</dt>
		<dd data-testid="video-paused">{videoPaused}</dd>
		<dt>Duration</dt>
		<dd data-testid="duration">{player ? player.duration : ""}</dd>
		<dt>Buffered</dt>
		<dd data-testid="buffered">{spans}</dd>
		<dt>Loaded</dt>
		<dd data-testid="loaded">{player?.source ? player.source : ""}</dd>
		<dt>Rate</dt>
		<dd data-testid="rate">{player ? player.rate : ""}</dd>
		<dt>Failure</dt>
		<dd data-testid="failure">{player?.error ? player.error.failure : "none"}</dd>
		<dt>Message</dt>
		<dd data-testid="message">{player?.error ? player.error.message : ""}</dd>
		<dt>Refused</dt>
		<dd data-testid="refused">{refused}</dd>
		<dt>Refusal name</dt>
		<dd data-testid="refusal-name">{player?.lastPlayError ? player.lastPlayError.name : ""}</dd>
		<dt>Refusal message</dt>
		<dd data-testid="refusal-message">
			{player?.lastPlayError ? player.lastPlayError.message : ""}
		</dd>
	</dl>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
</main>
