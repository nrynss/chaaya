<script lang="ts">
	import { ShortcutDispatcher, ShortcutRegistry } from "$lib/shortcuts/index.js";
	import { onDestroy, onMount } from "svelte";

	const registry = new ShortcutRegistry();
	const dispatcher = new ShortcutDispatcher(registry, { applePlatform: false });

	let pageCount = $state(0);
	let dialogCount = $state(0);
	let editCount = $state(0);
	let dialogOpen = $state(false);

	registry.register({
		id: "save",
		scope: "page",
		key: "k",
		description: "Count one page save.",
		handler: () => {
			pageCount += 1;
		}
	});
	registry.register({
		id: "save",
		scope: "dialog",
		key: "k",
		description: "Count one dialog save.",
		handler: () => {
			dialogCount += 1;
		}
	});
	registry.register({
		id: "echo",
		scope: "page",
		key: "e",
		description: "Count one editable echo.",
		allowInEditable: true,
		handler: () => {
			editCount += 1;
		}
	});

	onMount(() => {
		dispatcher.start(document);
	});

	onDestroy(() => {
		dispatcher.stop();
	});

	/** Open the dialog scope, so its binding shadows the page one. */
	function openDialog(): void {
		dialogOpen = true;
		dispatcher.pushScope("dialog");
	}

	/** Close the dialog scope, so the page binding answers again. */
	function closeDialog(): void {
		dialogOpen = false;
		dispatcher.popScope();
	}
</script>

<main>
	<h1>Shortcuts harness</h1>
	<p data-testid="page-count">{pageCount}</p>
	<p data-testid="dialog-count">{dialogCount}</p>
	<p data-testid="edit-count">{editCount}</p>
	<p data-testid="dialog-open">{dialogOpen ? "open" : "closed"}</p>
	<label for="harness-field">A text field</label>
	<input id="harness-field" data-testid="field" type="text" />
	<button type="button" data-testid="open" onclick={openDialog}>Open dialog</button>
	{#if dialogOpen}
		<div role="dialog" aria-label="Harness dialog" data-testid="dialog">
			<p>The dialog scope is active.</p>
			<button type="button" data-testid="close" onclick={closeDialog}>Close dialog</button>
		</div>
	{/if}
</main>
