<script lang="ts">
	import { page } from "$app/state";
	import { onMount } from "svelte";
	import { SessionGuard } from "$lib/guard/session-guard.svelte.js";

	/** The endpoint that collects close notices. A spec passes one in. */
	const target = page.url.searchParams.get("close") ?? "";

	/** The guard holding this page's session. Built at mount, so it never touches a browser global during render. */
	let guard = $state<SessionGuard | null>(null)
	let hydrated = $state(false)
	let attached = $state(false)

	onMount(() => {
		hydrated = true
		const next = new SessionGuard({ url: target })
		next.attach()
		guard = next
		attached = true
	})
</script>

<main>
	<h1>Session guard harness</h1>
	<dl>
		<dt>Attached</dt>
		<dd data-testid="attached">{attached ? "yes" : "no"}</dd>
		<dt>Hydrated</dt>
		<dd data-testid="hydrated">{hydrated ? "yes" : "no"}</dd>
	</dl>
	<button
		type="button"
		data-testid="leave"
		disabled={!hydrated || guard === null}
		onclick={() => {
			guard?.destroy()
			guard = null
		}}
	>
		Leave
	</button>
	<button
		type="button"
		data-testid="close-twice"
		disabled={!hydrated || guard === null}
		onclick={() => {
			guard?.close();
			guard?.close();
		}}
	>
		Close twice
	</button>
</main>
