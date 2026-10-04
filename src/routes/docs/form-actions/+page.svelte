<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";

	let { form } = $props();
</script>

<svelte:head>
	<title>form actions</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-form-actions">
	<h1>form actions</h1>
	<p>The button posts a fixed ApiError through failFromApiError. The code is the ApiError code.</p>
	<form method="POST">
		<button type="submit" data-testid="refuse">Refuse</button>
	</form>
	<dl>
		<dt>Code</dt>
		<dd data-testid="code">{form?.code ?? ""}</dd>
		<dt>Message</dt>
		<dd data-testid="message">{form?.message ?? ""}</dd>
		<dt>Retry after</dt>
		<dd data-testid="retry-after">{form?.retryAfterSeconds ?? ""}</dd>
	</dl>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
