<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { packageName } from "$lib/index.js";

	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});
</script>

<svelte:head>
	<title>Chaaya docs</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-root">
	<h1>Chaaya</h1>
	<p data-testid="package-name">{packageName}</p>
	<p>The root names the package. Each key below links to a working page.</p>
	<nav aria-label="Pieces">
		<ul>
			<li><a href={resolve("/docs/tokens")}>tokens</a></li>
			<li><a href={resolve("/docs/theme")}>theme</a></li>
			<li><a href={resolve("/docs/wire")}>keel wire</a></li>
			<li><a href={resolve("/docs/api")}>api</a></li>
			<li><a href={resolve("/docs/job-progress")}>job progress</a></li>
			<li><a href={resolve("/docs/job")}>keel job</a></li>
			<li><a href={resolve("/docs/audio-capture")}>audio capture</a></li>
			<li><a href={resolve("/docs/audio-upload")}>keel upload</a></li>
			<li><a href={resolve("/docs/audio-playback")}>audio playback</a></li>
			<li><a href={resolve("/docs/audio-stream")}>audio stream</a></li>
			<li><a href={resolve("/docs/audio-levels")}>audio levels</a></li>
			<li><a href={resolve("/docs/audio-peaks")}>audio peaks</a></li>
			<li><a href={resolve("/docs/session-guard")}>session guard</a></li>
			<li><a href={resolve("/docs/transcript")}>transcript</a></li>
			<li><a href={resolve("/docs/testing")}>testing</a></li>
		</ul>
	</nav>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
</main>
