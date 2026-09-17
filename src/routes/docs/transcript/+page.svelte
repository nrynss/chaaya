<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { TranscriptEditor } from "$lib/transcript/index.js";
	import { a11yGate, contrastGate } from "$lib/testing/index.js";

	type DemoWord = { start: number; end: number; text: string; speaker: string };

	const demo: DemoWord[] = [
		{ start: 0, end: 0.5, text: "amber", speaker: "sam" },
		{ start: 0.6, end: 1.1, text: "wakes", speaker: "sam" },
		{ start: 1.2, end: 1.7, text: "before", speaker: "jo" },
		{ start: 1.8, end: 2.3, text: "dawn", speaker: "jo" },
		{ start: 2.4, end: 2.9, text: "daily", speaker: "sam" },
		{ start: 3, end: 3.5, text: "early", speaker: "sam" }
	];

	const editor = new TranscriptEditor(demo);

	let hydrated = $state(false);
	let gates = $state("idle");
	let gateFailure = $state("");

	const pairs = [
		["text", "surface"],
		["dim", "surface"],
		["accent", "surface"],
		["on-accent", "accent"]
	] as const;

	const selectionText = $derived(
		editor.selection
			? `words ${editor.selection.start} to ${editor.selection.end}`
			: "no selection"
	);

	const cutsText = $derived(
		editor.cuts.length === 0
			? "no cuts"
			: editor.cuts.map((cut) => `${cut.id}: words ${cut.range.start} to ${cut.range.end}`).join(", ")
	);

	function focusWord(index: number): void {
		editor.select(index);
		document.querySelector<HTMLElement>(`[data-testid="word-${index}"]`)?.focus();
	}

	function extendTo(index: number): void {
		editor.extend(index);
	}

	async function runGates(): Promise<void> {
		gates = "running";
		gateFailure = "";
		try {
			const container = document.querySelector<HTMLElement>("[data-testid='docs-transcript']");
			if (!container) throw new Error("the markup is missing");
			await a11yGate(container);
			contrastGate(referenceCss, pairs);
			gates = "done";
		} catch (error) {
			gateFailure = error instanceof Error ? error.message.split("\n")[0] : String(error);
			gates = "failed";
		}
	}

	onMount(() => {
		hydrated = true;
	});
</script>

<svelte:head>
	<title>transcript</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-transcript">
	<h1>transcript</h1>
<p>A transcript carries timed words. A cut removes a word span with a reason, and every cut reverts. A follower binds the words to a player. The word under the playhead is derived state, a word click seeks to its start, and a cut span stays silent while playback passes it.</p>
	<section aria-label="Words">
		<ol>
			{#each demo as word, index (word.text)}
				<li>
					<button
						type="button"
						data-testid={`word-${index}`}
						aria-pressed={editor.selection !== null &&
							index >= Math.min(editor.anchor ?? index, editor.focus ?? index) &&
							index <= Math.max(editor.anchor ?? index, editor.focus ?? index)}
						disabled={!hydrated}
						onclick={() => focusWord(index)}
					>
						{word.text} {word.start.toFixed(1)} to {word.end.toFixed(1)}, {word.speaker}
					</button>
					<button
						type="button"
						data-testid={`extend-${index}`}
						aria-label={`Extend selection to ${word.text}`}
						disabled={!hydrated}
						onclick={() => extendTo(index)}
					>
						Extend to {word.text}
					</button>
					<span data-testid={`edited-${index}`}>
						edited {editor.editedStart(index).toFixed(2)} to {editor.editedEnd(index).toFixed(2)}
					</span>
				</li>
			{/each}
		</ol>
	</section>
	<p>
		<label for="docs-reason">Cut reason</label>
		<input id="docs-reason" data-testid="reason" bind:value={editor.reason} />
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
	<dl>
		<dt>Selection</dt>
		<dd data-testid="selection">{selectionText}</dd>
		<dt>Cuts</dt>
		<dd data-testid="cuts">{cutsText}</dd>
		<dt>Edited length</dt>
		<dd data-testid="length">{editor.length.toFixed(2)} seconds</dd>
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
