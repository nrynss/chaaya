<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { ApiError, api } from "$lib/api/index.js";
	import { keelErrorParser } from "$lib/adapters/keel/index.js";

	let hydrated = $state(false);
	let code = $state("");
	let status = $state(0);
	let retryAfter = $state("");
	let failure = $state("");

	onMount(() => {
		hydrated = true;
	});

	async function run(): Promise<void> {
		failure = "";
		try {
			await api<{ id: string }>("/docs/api/fixture", { parseError: keelErrorParser });
			code = "unexpected-success";
		} catch (error) {
			if (error instanceof ApiError) {
				code = error.code;
				status = error.status;
				retryAfter = error.retryAfterSeconds === undefined ? "" : String(error.retryAfterSeconds);
			} else {
				failure = String(error);
			}
		}
	}
</script>

<svelte:head>
	<title>api</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-api">
	<h1>api</h1>
	<button type="button" data-testid="run" disabled={!hydrated} onclick={run}>Call</button>
	<p data-testid="failure">{failure}</p>
	<dl>
		<dt>Code</dt>
		<dd data-testid="code">{code}</dd>
		<dt>Status</dt>
		<dd data-testid="status">{status === 0 ? "" : status}</dd>
		<dt>Retry after</dt>
		<dd data-testid="retry-after">{retryAfter}</dd>
	</dl>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
