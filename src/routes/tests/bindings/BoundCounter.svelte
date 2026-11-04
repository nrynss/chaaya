<script lang="ts">
	import { untrack } from "svelte";
	import { attach, reactive } from "$lib/svelte/index.js";
	import type { Counter } from "./counter.js";

	let { counter }: { counter: Counter } = $props();
	const bound = reactive(untrack(() => counter));
	const increment = bound.increment;
	const methodIsStable = increment === bound.increment;
	const evaluations = { count: 0 };

	attach(bound);

	/* One template expression reads the same target several times. A plain
	 * counter records how often it runs, without adding a reactive
	 * dependency of its own. */
	function reading(): string {
		evaluations.count += 1;
		return `${evaluations.count}:${bound.value}:${bound.doubled}:${bound.version}`;
	}
</script>

<section aria-label="Bound counter">
	<p data-testid="reading">{reading()}</p>
	<p data-testid="stable-method">{methodIsStable ? "yes" : "no"}</p>
	<button type="button" data-testid="method" onclick={increment}>Increment through a method</button>
	<button type="button" data-testid="setter" onclick={() => { bound.value += 1; }}>Increment through a setter</button>
	<button type="button" data-testid="unchanged" onclick={() => { bound.value = bound.value; }}>Assign the same value</button>
</section>
