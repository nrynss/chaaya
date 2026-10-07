<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onDestroy, onMount } from "svelte";
	import {
		ShortcutDispatcher,
		ShortcutRegistry,
		formatBinding
	} from "$lib/shortcuts/index.js";

	const registry = new ShortcutRegistry();
	const dispatcher = new ShortcutDispatcher(registry);

	let counts = $state<Record<string, number>>({});
	let hydrated = $state(false);

	/** Count one demo firing, so the page proves the binding ran. */
	function count(id: string): void {
		counts = { ...counts, [id]: (counts[id] ?? 0) + 1 };
	}

	registry.register({
		id: "play",
		key: "k",
		description: "Count one play.",
		handler: () => count("play")
	});
	registry.register({
		id: "help",
		key: "?",
		description: "Count one help request.",
		handler: () => count("help")
	});
	registry.register({
		id: "undo",
		key: "z",
		modifiers: { mod: true },
		description: "Count one undo.",
		handler: () => count("undo")
	});
	registry.register({
		id: "step",
		code: "ArrowRight",
		description: "Count one step forward.",
		handler: () => count("step")
	});

	/** The help rows the registry reports, in binding order. */
	const rows = $derived(
		registry.list().map((binding) => ({
			id: binding.id,
			text: `${formatBinding(binding)}: ${binding.description}`
		}))
	);

	onMount(() => {
		hydrated = true;
		dispatcher.start(document);
	});

	onDestroy(() => {
		dispatcher.stop();
	});
</script>

<svelte:head>
	<title>shortcuts</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-shortcuts">
	<h1>shortcuts</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		A <code>ShortcutRegistry</code> on <code>@nrynss/chaaya/shortcuts</code> holds bindings
		with a stable id, keys, a scope, a description, and a handler. The list below renders
		from the registry itself, so the help view never drifts from the real bindings. Press
		the keys to fire each row.
	</p>
	<p>
		The dispatcher skips events from editable and interactive targets unless a binding
		opts in. <code>Mod</code> maps to Command on Apple platforms and Control elsewhere.
		A key matches by <code>event.key</code> with a <code>code</code> fallback, so one
		physical key works across layouts. Scopes nest, and a dialog scope shadows the page
		while it stays open. The consumer renders the help overlay itself, using Bits UI for
		any dialog.
	</p>
	<ul aria-label="Shortcut help">
		{#each rows as row (row.id)}
			<li data-testid={`help-${row.id}`}>{row.text}</li>
		{/each}
	</ul>
	<dl>
		<dt>Play count</dt>
		<dd data-testid="demo-play">{counts["play"] ?? 0}</dd>
		<dt>Help count</dt>
		<dd data-testid="demo-help">{counts["help"] ?? 0}</dd>
		<dt>Undo count</dt>
		<dd data-testid="demo-undo">{counts["undo"] ?? 0}</dd>
		<dt>Step count</dt>
		<dd data-testid="demo-step">{counts["step"] ?? 0}</dd>
	</dl>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
