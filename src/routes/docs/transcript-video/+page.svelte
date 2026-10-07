<script lang="ts">
	import { resolve } from "$app/paths"
	import referenceCss from "$lib/tokens/reference.css?raw"
	import { onMount } from "svelte"
	import { AudioPlayer } from "$lib/audio/playback/player.svelte.js"
	import { TranscriptEditor, TranscriptFollower } from "$lib/transcript/index.js"
	import { a11yGate, contrastGate } from "$lib/testing/index.js"

	type DemoWord = { start: number; end: number; text: string }

	const demo: DemoWord[] = [
		{ start: 0, end: 1, text: "amber" },
		{ start: 1, end: 2, text: "wakes" },
		{ start: 2, end: 3, text: "before" },
		{ start: 3, end: 4, text: "dawn" },
		{ start: 4, end: 5, text: "daily" },
		{ start: 5, end: 6, text: "early" }
	]

	const editor = new TranscriptEditor(demo)
	let video: HTMLVideoElement | undefined
	let player = $state<AudioPlayer | null>(null)
	let follower = $state<TranscriptFollower | null>(null)
	let hydrated = $state(false)
	let gates = $state("idle")
	let gateFailure = $state("")

	const pairs = [
		["text", "surface"],
		["dim", "surface"],
		["accent", "surface"],
		["on-accent", "accent"]
	] as const

	onMount(() => {
		if (video) {
			const owned = new AudioPlayer({ element: video })
			owned.load("/docs/video-playback/media/clip.webm")
			player = owned
			const bound = new TranscriptFollower(editor, owned)
			bound.follow()
			follower = bound
		}
		hydrated = true
	})

	function focusWord(index: number): void {
		editor.select(index)
		document.querySelector<HTMLElement>(`[data-testid="word-${index}"]`)?.focus()
	}

	function seekWord(index: number): void {
		follower?.seekToWord(index)
	}

	async function runGates(): Promise<void> {
		gates = "running"
		gateFailure = ""
		try {
			const container = document.querySelector<HTMLElement>("[data-testid='docs-transcript-video']")
			if (!container) throw new Error("the markup is missing")
			await a11yGate(container)
			contrastGate(referenceCss, pairs)
			gates = "done"
		} catch (error) {
			gateFailure = error instanceof Error ? error.message.split("\n")[0] : String(error)
			gates = "failed"
		}
	}
</script>

<svelte:head>
	<title>transcript video</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-transcript-video">
	<h1>transcript video</h1>
	<p>Timed words bind to a video clock the same way they bind to audio. The player adopts the caller owned video element, and the follower highlights the word under the element clock. The binding reads the element clock and never starts its own timer. Cuts keep pointing at the word list the follower was built with. The element and its visible timeline stay the consumer owned.</p>
	<video
		data-testid="video"
		bind:this={video}
		playsinline
		preload="metadata"
		width="320"
		height="240"
	></video>
	<section aria-label="Words">
		<ol>
			{#each demo as word, index (word.text)}
				<li>
					<button
						type="button"
						data-testid={`word-${index}`}
						aria-label={`Select word ${word.text}`}
						aria-pressed={editor.selection !== null &&
							index >= Math.min(editor.anchor ?? index, editor.focus ?? index) &&
							index <= Math.max(editor.anchor ?? index, editor.focus ?? index)}
						disabled={!hydrated}
						onclick={() => focusWord(index)}
					>
						{word.text} {word.start.toFixed(1)} to {word.end.toFixed(1)}
					</button>
					<button
						type="button"
						data-testid={`seek-${index}`}
						aria-label={`Seek to word ${word.text}`}
						disabled={!hydrated}
						onclick={() => seekWord(index)}
					>
						Seek to {word.text}
					</button>
				</li>
			{/each}
		</ol>
	</section>
	<button type="button" data-testid="play" disabled={!player} onclick={() => void player?.play()}>
		Play
	</button>
	<button type="button" data-testid="pause" disabled={!player} onclick={() => player?.pause()}>
		Pause
	</button>
	<dl>
		<dt>Playing</dt>
		<dd data-testid="playing">{player ? player.playing : ""}</dd>
		<dt>Current time</dt>
		<dd data-testid="current-time">{player ? player.currentTime.toFixed(2) : ""}</dd>
		<dt>Active word</dt>
		<dd data-testid="active-word">
			{follower && follower.activeWord !== null ? follower.activeWord : "none"}
		</dd>
		<dt>Gates</dt>
		<dd data-testid="gates">{gates}</dd>
		<dt>Gate failure</dt>
		<dd data-testid="gate-failure">{gateFailure}</dd>
	</dl>
	<button type="button" data-testid="run-gates" disabled={!hydrated} onclick={runGates}>
		Run gates
	</button>
	<section aria-label="Sample">
		<div data-testid="sample-text" style="background: var(--surface); color: var(--text);">sample text</div>
		<div data-testid="sample-dim" style="background: var(--surface); color: var(--dim);">sample dim</div>
		<div data-testid="sample-accent" style="background: var(--accent); color: var(--on-accent);">sample accent</div>
		<a href={resolve("/docs")}>back</a>
	</section>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
