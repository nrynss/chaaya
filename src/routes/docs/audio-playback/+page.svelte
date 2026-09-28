<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { AudioPlayer } from "$lib/audio/playback/player.svelte.js";

	const player = new AudioPlayer();

	let hydrated = $state(false);
	let source = $state("/docs/audio-playback/media/tone.wav");
	let seekSeconds = $state(0);
	let refused = $state(false);

	onMount(() => {
		hydrated = true;
	});

	async function play(): Promise<void> {
		refused = !(await player.play(source));
	}

	const spans = $derived(
		player.buffered.map((span) => `${span.start.toFixed(3)} to ${span.end.toFixed(3)}`).join(", ")
	);
</script>

<svelte:head>
	<title>audio playback</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-audio-playback">
	<h1>audio playback</h1>
	<p>
		The player reports what went wrong with a load. A network failure means the bytes never
		arrived, and a decode failure means they arrived and the browser could not read them. Both
		stop the element, and both clear playing.
	</p>
	<p>
		An output failure is different. A browser that loses its audio sink, for example when the
		last output device goes away, raises an error straight after playback starts and keeps
		playing. The player leaves playing true, so the pause control keeps working, and error
		carries the class output with the browser's own message. The player never re-reads the
		source for this failure, because the bytes are not in doubt.
	</p>
	<p>
		A refused play keeps its reason on lastPlayError. The name carries the browser refusal,
		such as NotAllowedError, and the message carries its words. A successful play clears it.
	</p>
	<p>
		<label for="docs-source">Source</label>
		<input id="docs-source" data-testid="source" bind:value={source} />
	</p>
	<button type="button" data-testid="load" disabled={!hydrated} onclick={() => player.load(source)}>
		Load
	</button>
	<button type="button" data-testid="play" disabled={!hydrated} onclick={play}>Play</button>
	<button type="button" data-testid="pause" disabled={!hydrated} onclick={() => player.pause()}>
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
		<dt>Failure</dt>
		<dd data-testid="failure">{player.error ? player.error.failure : "none"}</dd>
		<dt>Message</dt>
		<dd data-testid="message">{player.error ? player.error.message : ""}</dd>
		<dt>Refused</dt>
		<dd data-testid="refused">{refused}</dd>
		<dt>Refusal name</dt>
		<dd data-testid="refusal-name">{player.lastPlayError ? player.lastPlayError.name : ""}</dd>
		<dt>Refusal message</dt>
		<dd data-testid="refusal-message">{player.lastPlayError ? player.lastPlayError.message : ""}</dd>
	</dl>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
