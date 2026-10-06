<script lang="ts">
	import { consumeShareLaunch, type SharedPayload } from "$lib/share/index.js";
	import { onMount } from "svelte";

	let payload = $state<SharedPayload | null>(null);
	let ready = $state(false);

	onMount(() => {
		payload = consumeShareLaunch(undefined, { path: "/share" }) ?? null;
		ready = true;
	});
</script>

<main>
	<h1>Share target</h1>
	<p data-testid="ready">{ready ? "yes" : "no"}</p>
	<p data-testid="payload-present">{payload ? "yes" : "no"}</p>
	<p data-testid="share-url">{payload?.url ?? ""}</p>
	<p data-testid="share-text">{payload?.text ?? ""}</p>
	<p data-testid="share-title">{payload?.title ?? ""}</p>
</main>
