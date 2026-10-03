<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";

	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});
</script>

<svelte:head>
	<title>passcode gate</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-gate">
	<h1>passcode gate</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		<code>GatePasscode</code> on <code>@nrynss/chaaya/api</code> sends a caller-named header and cookie. It
		names no backend. An adapter is a function that fills those names. <code>keelGate</code> on
		<code>@nrynss/chaaya/keel</code> fills <code>X-Passcode</code>, the cookie <code>passcode</code>, and the
		code <code>passcode_required</code>.
	</p>
	<p>
		<code>authCodes</code> is a plain array checked with <code>includes</code>. A code named
		<code>constructor</code> is not an auth code unless it is in the list. <code>GateError</code> keeps
		<code>detail</code> and <code>retryAfterSeconds</code> from the <code>ApiError</code> it wraps.
	</p>
	<p>
		Importing the module does not touch <code>document</code>. Pass <code>jar: document</code> only in the
		browser. Omit the jar under SSR. Browser fetch hides <code>Set-Cookie</code>, so
		<code>remember()</code> does not read that header there. Node still does. In a browser, use the JSON
		member <code>passcode</code>, or read the cookie the browser stored.
	</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
