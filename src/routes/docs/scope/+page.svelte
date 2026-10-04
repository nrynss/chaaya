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
		<code>JobStream</code>, arbitrary <code>createEventStream</code>, chunked
		<code>Uploader</code>, and one-shot <code>uploadBlob</code>. It does not
		cover WebSocket, native <code>EventSource</code>, or resumable
		direct-to-storage multipart. <code>Last-Event-ID</code> is sent on
		reconnect. A server may still start from now. Errors are one typed
		<code>ApiError</code>. The envelope parser is the adapter's. Framework
		scope is Svelte 5 only, for now.
	</p>
	<p>
		The written contract is <code>docs/scope.md</code>. Job details are
		<code>docs/job-progress.md</code>. Upload details are
		<code>docs/upload.md</code>. Adapter writing is
		<code>docs/adapters.md</code>.
	</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
