<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { createTranscriptBridge, type TranscriptBridge } from "$lib/transcript/stream.js";

	const example = [
		'import { createEventStream } from "@nrynss/chaaya/sse";',
		'import { TranscriptEditor, createTranscriptBridge } from "@nrynss/chaaya/transcript";',
		"",
		"const bridge = createTranscriptBridge({ events: [\"word\"], doneEvent: \"done\" });",
		"let editor: TranscriptEditor | undefined;",
		"const stream = createEventStream(\"/transcript/events\", {",
		"\tevents: [\"word\", \"done\"],",
		"\tterminal: [\"done\"],",
		"\tonFrame(event) {",
		"\t\tconst applied = bridge.apply(event);",
		"\t\tif (applied.type === \"done\") editor = new TranscriptEditor(bridge.ordered());",
		"\t},",
		"});",
	].join("\n");

	let hydrated = $state(false);
	let bridge: TranscriptBridge | null = null;
	let lines = $state("No words yet.");
	let done = $state("open");

	onMount(() => {
		hydrated = true;
		bridge = createTranscriptBridge({ events: ["word"], doneEvent: "done" });
	});

	function paint(): void {
		if (!bridge) return;
		lines = bridge.words.map((word) => `${word.start.toFixed(1)} ${word.text}`).join(" ") || "No words yet.";
		done = bridge.done ? "done" : "open";
	}

	/** Two words and a done frame, the shape a server would send. */
	function pushSample(): void {
		if (!bridge) return;
		bridge.apply({ name: "progress", data: JSON.stringify({ percent: 40 }) });
		bridge.apply({
			name: "word",
			data: JSON.stringify({ start: 0.0, end: 0.4, text: "amber" }),
		});
		bridge.apply({
			name: "word",
			data: JSON.stringify({ start: 0.5, end: 0.9, text: "wakes", speaker: "narrator" }),
		});
		bridge.apply({ name: "done", data: "" });
		paint();
	}

	function reset(): void {
		bridge?.reset();
		paint();
	}
</script>

<svelte:head>
	<title>transcript stream</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-transcript-stream">
	<h1>transcript stream</h1>
	<p>
		<code>createTranscriptBridge</code> folds timed-word frames into the array
		<code>TranscriptEditor</code> is constructed with. It names no backend. A word is
		<code>start</code>, <code>end</code>, and <code>text</code>, with an optional speaker.
		An optional index revises a word already kept. A JSON array, or an object with
		<code>words</code>, replaces the list.
	</p>
	<p>
		The editor does not grow, and this bridge does not change it. Cuts are indexes into the
		list the editor was given. Construct the editor when the bridge is done, or from a snapshot
		that will not shift earlier indexes. <code>ordered()</code> sorts a copy by source time.
	</p>
	<p>
		<code>doneEvent</code> on the bridge still matches when that name is missing from the bridge's
		own <code>events</code> list. <code>createEventStream</code> is stricter: a terminal name that
		is absent from the stream's <code>events</code> list is dropped before the bridge sees it.
		Put the done name in both lists when the socket should close. The bridge does not close it.
	</p>
	<pre data-testid="example"><code>{example}</code></pre>
	<p data-testid="words">{lines}</p>
	<p data-testid="done">{done}</p>
	<button type="button" data-testid="sample" disabled={!hydrated} onclick={pushSample}>Apply a sample stream</button>
	<button type="button" data-testid="reset" disabled={!hydrated} onclick={reset}>Reset</button>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
