<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { SessionGuard } from "$lib/guard/session-guard.svelte.js";

	let guard: SessionGuard | null = $state(null);
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	/** Hold one live session, so the page tells the server when it leaves. */
	function hold(): void {
		if (guard !== null) return;
		const next = new SessionGuard({ url: "/docs/session-guard/close" });
		next.attach();
		guard = next;
	}

	/** Release the session in the open. The guard still closes it on
	 * destroy, so the server sees exactly one close either way. */
	function release(): void {
		guard?.destroy();
		guard = null;
	}
</script>

<svelte:head>
	<title>session guard</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-session-guard">
	<h1>session guard</h1>
	<p>A page that holds a live session tells the server it is leaving. The guard sends one close on pagehide and on destroy, and the first send wins.</p>
	<button type="button" data-testid="hold" disabled={!hydrated || guard !== null} onclick={hold}>Hold a session</button>
	<button type="button" data-testid="release" disabled={!hydrated || guard === null} onclick={release}>Release</button>
	<p data-testid="held">{guard === null ? "released" : "held"}</p>
	<p data-testid="closed">{guard?.closed === true ? "closed" : "open"}</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
