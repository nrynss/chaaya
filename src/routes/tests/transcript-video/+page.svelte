<script lang="ts">
	import { onMount } from "svelte"
	import { AudioPlayer } from "$lib/audio/playback/player.svelte"
	import { TranscriptEditor, TranscriptFollower } from "$lib/transcript/index.js"

	/* Words number six, one per second, so each start reads whole seconds.
	 * The clip runs five minutes, which leaves every word early in the
	 * timeline where each engine reaches it fast. */
	const demo = [
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
	let followError = $state("")

	/* The player adopts the markup element, the shape a caller owns. The
	 * follower binds the words to that player, so the binding reads the
	 * element clock through the player and never starts its own timer. */
	onMount(() => {
		if (video) {
			const owned = new AudioPlayer({ element: video })
			owned.load("/tests/transcript-video/media/clip.webm")
			player = owned
			const bound = new TranscriptFollower(editor, owned)
			bound.follow()
			follower = bound
		}
		hydrated = true
	})

	/* Move focus onto the chosen word, so a keyboard run watches focus move
	 * the same way a pointer run would. */
	function focusWord(index: number): void {
		editor.select(index)
		document.querySelector<HTMLElement>(`[data-testid="word-${index}"]`)?.focus()
	}
	/* Seeking reads the word start through the follower. The test drives play
	 * and pause itself, so a seek never races a source swap. */
	function seekWord(index: number): void {
		try {
			follower?.seekToWord(index)
		} catch (error) {
			followError = error instanceof Error ? error.message : String(error)
		}
	}
</script>

<main data-testid="harness-transcript-video">
	<h1>Transcript video harness</h1>
	<video
		data-testid="video"
		bind:this={video}
		playsinline
		preload="metadata"
		width="320"
		height="240"
	></video>
	<p data-testid="playing">{player ? player.playing : ""}</p>
	<p data-testid="current-time">{player ? player.currentTime.toFixed(2) : ""}</p>
	<p data-testid="active-word">
		{follower && follower.activeWord !== null ? follower.activeWord : "none"}
	</p>
	<ol aria-label="Words">
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
					{word.text}
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
	<button type="button" data-testid="play" disabled={!player} onclick={() => void player?.play()}>
		Play
	</button>
	<button type="button" data-testid="pause" disabled={!player} onclick={() => player?.pause()}>
		Pause
	</button>
	<p data-testid="follow-error">{followError}</p>
</main>
