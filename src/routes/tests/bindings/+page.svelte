<script lang="ts">
	import { onMount } from "svelte";
	import BoundCounter from "./BoundCounter.svelte";
	import { Counter, type LifecycleCounts } from "./counter.js";

	const counts = $state<LifecycleCounts>({ attaches: 0, teardowns: 0 });
	const counter = new Counter(counts);
	let visible = $state(true);
	let hydrated = $state(false);

	onMount(() => { hydrated = true; });
</script>

<main>
	<h1>Observable binding harness</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p data-testid="attaches">{counts.attaches}</p>
	<p data-testid="teardowns">{counts.teardowns}</p>
	<button type="button" data-testid="toggle" disabled={!hydrated} onclick={() => { visible = !visible; }}>Toggle counter</button>
	{#if visible}
		<BoundCounter {counter} />
	{/if}
</main>
