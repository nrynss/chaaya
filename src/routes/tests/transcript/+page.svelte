<script lang="ts">
	import { onMount } from "svelte"
	import { AudioPlayer } from "$lib/audio/playback/player.svelte"
	import { TranscriptEditor, TranscriptFollower } from "$lib/transcript/index.js"

	/* Words number six, one per second, so each start reads whole seconds.
	 * The tone runs ten seconds, which leaves a word past the last cut. */
	const demo = [
		{ start: 0, end: 1, text: "amber" },
		{ start: 1, end: 2, text: "wakes" },
		{ start: 2, end: 3, text: "before" },
		{ start: 3, end: 4, text: "dawn" },
		{ start: 4, end: 5, text: "daily" },
		{ start: 5, end: 6, text: "early" }
	]

	const editor = new TranscriptEditor(demo)
	const player = new AudioPlayer()
	const follower = new TranscriptFollower(editor, player)
	follower.follow()

	let hydrated = $state(false)
	let followError = $state("")

	function bindSelection(): void {
		editor.select(1)
		editor.extend(2)
	}

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
			follower.seekToWord(index)
		} catch (error) {
			followError = error instanceof Error ? error.message : String(error)
		}
	}
	onMount(() => {
		player.load("/tests/transcript/media/tone.wav")
		hydrated = true
	})
</script>

<main data-testid="harness-transcript">
	<h1>Transcript harness</h1>
	<p data-testid="playing">{player.playing}</p>
	<p data-testid="current-time">{player.currentTime.toFixed(2)}</p>
	<p data-testid="active-word">{follower.activeWord === null ? "none" : follower.activeWord}</p>
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
				<button
					type="button"
					data-testid={`extend-${index}`}
					aria-label={`Extend selection to ${word.text}`}
					disabled={!hydrated}
					onclick={() => editor.extend(index)}
				>
					Extend to {word.text}
				</button>
				<span data-testid={`edited-${index}`}>
					edited {editor.editedStart(index).toFixed(2)} to {editor.editedEnd(index).toFixed(2)}
				</span>
			</li>
		{/each}
	</ol>
	<p>
		<label for="reason">Cut reason</label>
		<input id="reason" data-testid="reason" bind:value={editor.reason} />
	</p>
	<button type="button" data-testid="select-cut-span" disabled={!hydrated} onclick={bindSelection}>
		Select cut span
	</button>
	<button type="button" data-testid="cut" disabled={!hydrated} onclick={() => editor.cut()}>
		Cut selection
	</button>
	<button type="button" data-testid="revert-all" disabled={!hydrated} onclick={() => editor.revertAll()}>
		Revert all cuts
	</button>
	<button type="button" data-testid="play" disabled={!hydrated} onclick={() => void player.play()}>
		Play
	</button>
	<button type="button" data-testid="pause" disabled={!hydrated} onclick={() => player.pause()}>
		Pause
	</button>
	<ul aria-label="Cuts">
		{#each editor.cuts as cut (cut.id)}
			<li>
				<span data-testid={`cut-${cut.id}`}>{cut.id}: words {cut.range.start} to {cut.range.end}, {cut.reason}</span>
				<button
					type="button"
					data-testid={`revert-${cut.id}`}
					aria-label={`Revert ${cut.id}`}
					disabled={!hydrated}
					onclick={() => editor.revert(cut.id)}
				>
					Revert {cut.id}
				</button>
			</li>
		{/each}
	</ul>
	<p data-testid="selection">
		{editor.selection
			? `words ${editor.selection.start} to ${editor.selection.end}`
			: "no selection"}
	</p>
	<p data-testid="cuts">
		{editor.cuts.length === 0
			? "no cuts"
			: editor.cuts.map((cut) => `${cut.id}: words ${cut.range.start} to ${cut.range.end}`).join(", ")}
	</p>
	<p data-testid="length">{editor.length.toFixed(2)} seconds</p>
	<p data-testid="follow-error">{followError}</p>
</main>
