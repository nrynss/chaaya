<script lang="ts">
	import { resolve } from "$app/paths"
	import referenceCss from "$lib/tokens/reference.css?raw"
	import { onMount } from "svelte"
	import { AudioPlayer } from "$lib/audio/playback/player.svelte.js"

	let video: HTMLVideoElement | undefined
	let player = $state<AudioPlayer | null>(null)
	let source = $state("/docs/video-playback/media/clip.webm")
	let seekSeconds = $state(0)
	let refused = $state(false)
	let videoTime = $state(0)
	let videoPaused = $state(true)

	onMount(() => {
		if (video) player = new AudioPlayer({ element: video })
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

<svelte:head>
	<title>video playback</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-video-playback">
	<h1>video playback</h1>
	<p>
		Playback through one element covers video. The player accepts an element the caller
		owns, or creates its own audio element. A caller-owned element keeps what its markup
		gave it. The player attaches its listeners, primes the first gesture with a silent
		clip, and drives the source through load and play. The element stays the caller's to
		render and to size.
	</p>
	<p>
		Failure classes and refusals read the same as audio. A network failure means the
		bytes never arrived. A decode failure means they arrived and the browser could not
		read them. A refused play keeps its reason on lastPlayError, and a successful play
		clears it.
	</p>
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
		<label for="docs-source">Source</label>
		<input id="docs-source" data-testid="source" bind:value={source} />
	</p>
	<button type="button" data-testid="load" disabled={!player} onclick={() => player?.load(source)}>
		Load
	</button>
	<button type="button" data-testid="play" disabled={!player} onclick={play}>Play</button>
	<button type="button" data-testid="pause" disabled={!player} onclick={() => player?.pause()}>
		Pause
	</button>
	<p>
		<label for="docs-seek">Seek seconds</label>
		<input
			id="docs-seek"
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
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
