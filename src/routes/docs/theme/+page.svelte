<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { theme, themeToggleLabel, themeScript } from "$lib/theme/index.js";

	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	const label = $derived(hydrated ? themeToggleLabel(theme.resolved) : "");

	function toggle(): void {
		theme.set(theme.resolved === "dark" ? "light" : "dark");
	}

	const headScript = `<script>${themeScript}</` + `script>`;
</script>

<svelte:head>
	<title>theme</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html headScript}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-theme">
	<h1>theme</h1>
	<button type="button" data-testid="toggle" disabled={!hydrated} onclick={toggle}>
		{label}
	</button>
	<dl>
		<dt>Mode</dt>
		<dd data-testid="mode">{hydrated ? theme.mode : ""}</dd>
		<dt>Resolved</dt>
		<dd data-testid="resolved">{hydrated ? theme.resolved : ""}</dd>
	</dl>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
