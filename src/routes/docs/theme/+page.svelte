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

	const appHtmlSnippet =
		`<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t${headScript}\n\t\t%sveltekit.head%\n\t</head>\n\t<body>\n\t\t<div style="display: contents">%sveltekit.body%</div>\n\t</body>\n</html>`;

	const layoutSnippet = `<script lang="ts">
	import { theme, themeToggleLabel } from "@nrynss/chaaya/theme";

	function toggle(): void {
		theme.set(theme.resolved === "dark" ? "light" : "dark");
	}
</` + `script>

<button type="button" onclick={toggle}>
	{themeToggleLabel(theme.resolved)}
</button>`;
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
	<h2>Static build</h2>
	<p>
		Use this path for a static single page build and for a WebView
		wrapper. Neither runs server code, so no cookie can carry the mode.
		Paste the script below into <code>app.html</code> ahead of
		<code>%sveltekit.head%</code>. It reads the stored mode in a guarded
		block, so blocked storage falls back to the system instead of
		throwing. It sets <code>data-theme</code> only for an explicit mode.
		System mode leaves the attribute unset, and the token stylesheet
		tracks the operating system through its own media query.
	</p>
	<pre data-testid="app-html">{appHtmlSnippet}</pre>
	<h2>Root layout</h2>
	<p>
		Import the controller once in the root layout. The import paints the
		stored mode, and the object follows the system while the mode is
		system. Render your own control and read
		<code>themeToggleLabel</code> for its accessible name, as the button
		above does.
	</p>
	<pre data-testid="layout-snippet">{layoutSnippet}</pre>
	<h2>Server build</h2>
	<p>
		The same head script works with server rendering. A server build may
		also read the mode from a cookie in a server load and paint the
		attribute during render. The static path above stays required
		wherever no server runs. Chaaya ships no component and no stylesheet
		for any of this, only the mechanism this page demonstrates.
	</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
