<script lang="ts">
	import { onMount } from "svelte"
	import { TranscriptEditor } from "$lib/transcript/index.js"

	const demo = [
		{ start: 0, end: 0.5, text: "amber", speaker: "sam" },
		{ start: 0.6, end: 1.1, text: "wakes", speaker: "sam" },
		{ start: 1.2, end: 1.7, text: "before", speaker: "jo" },
		{ start: 1.8, end: 2.3, text: "dawn", speaker: "jo" },
		{ start: 2.4, end: 2.9, text: "daily", speaker: "sam" },
		{ start: 3, end: 3.5, text: "early", speaker: "sam" }
	]

	const editor = new TranscriptEditor(demo)

	let hydrated = $state(false)

	const selectionText = $derived(
		editor.selection
			? `words ${editor.selection.start} to ${editor.selection.end}`
			: "no selection"
	)

	const cutsText = $derived(
		editor.cuts.length === 0
			? "no cuts"
			: editor.cuts.map((cut) => `${cut.id}: words ${cut.range.start} to ${cut.range.end}`).join(", ")
	)

	/* Move focus onto the chosen word, so a keyboard run watches focus move
	 * the same way a pointer run would. */
	function focusWord(index: number): void {
		editor.select(index)
		document.querySelector<HTMLElement>(`[data-testid="word-${index}"]`)?.focus()
	}

	onMount(() => {
		hydrated = true
	})
</script>

<main data-testid="harness-transcript">
	<h1>Transcript harness</h1>
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
	<button type="button" data-testid="cut" disabled={!hydrated} onclick={() => editor.cut()}>
		Cut selection
	</button>
	<button type="button" data-testid="revert-all" disabled={!hydrated} onclick={() => editor.revertAll()}>
		Revert all cuts
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
	<p data-testid="selection">{selectionText}</p>
	<p data-testid="cuts">{cutsText}</p>
	<p data-testid="length">{editor.length.toFixed(2)} seconds</p>
</main>
