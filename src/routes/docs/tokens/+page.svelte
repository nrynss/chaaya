<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { tokenRoles, checkTokens } from "$lib/tokens/index.js";

	let styleTag = $state("");
	let hydrated = $state(false);

	onMount(() => {
		styleTag = referenceCss;
		hydrated = true;
	});

	const gaps = $derived(checkTokens(referenceCss));
	const gapText = $derived(
		gaps.length === 0 ? "0 gaps" : gaps.map((gap) => `${gap.theme}: ${gap.missing.join(",")}`).join("; ")
	);
</script>

<svelte:head>
	<title>tokens</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-tokens">
	<h1>tokens</h1>
	<p data-testid="role-count">{tokenRoles.length} roles</p>
	<p data-testid="gaps">{gapText}</p>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	{#if styleTag !== ""}
		<section aria-label="Swatches">
			<div data-testid="sw-ground" style="background: var(--ground); color: var(--text);">ground</div>
			<div data-testid="sw-surface" style="background: var(--surface); color: var(--text);">surface</div>
			<div data-testid="sw-raised" style="background: var(--raised); color: var(--text);">raised</div>
			<div data-testid="sw-sunken" style="background: var(--sunken); color: var(--text);">sunken</div>
			<div data-testid="sw-accent" style="background: var(--accent); color: var(--on-accent);">accent</div>
			<div data-testid="sw-ok" style="background: var(--surface); color: var(--ok);">ok</div>
			<div data-testid="sw-warn" style="background: var(--surface); color: var(--warn);">warn</div>
			<div data-testid="sw-stop" style="background: var(--surface); color: var(--stop);">stop</div>
		</section>
	{/if}
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
