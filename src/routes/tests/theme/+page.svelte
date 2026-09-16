<script lang="ts">
	import { onMount } from "svelte"
	import { theme, themeScript, themeToggleLabel } from "$lib/theme"

	/* The stored mode lives in the browser, so the markup waits for mount.
	 * A server render cannot know it and would hydrate a different theme. */
	let hydrated = $state(false)

	onMount(() => {
		hydrated = true
	})

	const label = $derived(hydrated ? themeToggleLabel(theme.resolved) : "")

	function toggle(): void {
		theme.set(theme.resolved === "dark" ? "light" : "dark")
	}

	/* The head script must arrive as raw markup. The exported constant is
	 * trusted, so the raw injection carries no user input. The closing
	 * sequence is assembled so the tag never closes this script block. */
	const headScript = `<script>${themeScript}</` + `script>`
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html headScript}
</svelte:head>

<main>
	<h1>Theme</h1>
	<button type="button" data-testid="toggle" disabled={!hydrated} onclick={toggle}>
		{label}
	</button>
	<dl>
		<dt>Mode</dt>
		<dd data-testid="mode">{hydrated ? theme.mode : ""}</dd>
		<dt>Resolved</dt>
		<dd data-testid="resolved">{hydrated ? theme.resolved : ""}</dd>
	</dl>
</main>
