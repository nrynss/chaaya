<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";

	let hydrated = $state(false);
	let body = $state("");

	onMount(() => {
		hydrated = true;
		void (async () => {
			const response = await fetch(`${resolve("/docs/job-stream-response")}?watch=demo`);
			body = await response.text();
		})();
	});
</script>

<svelte:head>
	<title>job stream response</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-job-stream-response">
	<h1>job stream response</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		<code>createJobStreamResponse</code> on <code>@nrynss/chaaya/sveltekit</code> builds a
		<code>text/event-stream</code> <code>Response</code> from an iterable of frames. A
		<code>+server.ts</code> returns it. A browser <code>JobStream</code> follows it. No Keel names.
		No UI. Pass <code>request.signal</code> so a dropped tab stops the writer. The guide is
		<code>docs/job-stream-response.md</code>.
	</p>
	<pre data-testid="stream-body">{body}</pre>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
