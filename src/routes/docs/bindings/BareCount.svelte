<script lang="ts">
	/** Reads a counter it was handed bare, with no binding. Its own
	 * template tracks nothing on the counter, so it renders once. */
	let { target }: { target: { readonly count: number } } = $props();
</script>

<output data-testid="bare">{target.count}</output>
