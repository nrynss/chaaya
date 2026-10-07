<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";

	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});
</script>

<svelte:head>
	<title>scope</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-scope">
	<h1>scope</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		Chaaya covers named SSE over <code>fetch</code>, a job-shaped
		<code>JobStream</code>, a polling <code>JobPoller</code> with the same
		reading, arbitrary <code>createEventStream</code>, chunked
		<code>Uploader</code>, one-shot <code>uploadBlob</code>, and direct
		<code>uploadDirectMultipart</code>. It does not
		cover WebSocket or native <code>EventSource</code>.
		<code>Last-Event-ID</code> is sent on reconnect. A hidden or offline page
		pauses instead of polling or reconnecting. A server may still
		start from now. Errors are one typed <code>ApiError</code>. The
		envelope parser is the adapter's. Framework scope is Svelte 5 only,
		for now.
	</p>
	<p>
		Audio capture, still image capture, share target intake, priced actions, playback through a
		media element, audio or video, levels and peaks, the recording session, transcript editing,
		timeline geometry and edit handles,
		the session guard, keyboard shortcuts, theme tokens, and the contrast and accessibility gates are covered too.
	</p>
	<p>
		Not covered yet: timed clips against a media clock and undo and redo. Each is an open issue.
	</p>
	<p>
		The written contract is <code>docs/scope.md</code>. Job details are
		<code>docs/job-progress.md</code>. Upload details are
		<code>docs/upload.md</code>. Adapter writing is
		<code>docs/adapters.md</code>.
	</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
