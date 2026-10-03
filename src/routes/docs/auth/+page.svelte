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
	<title>auth</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-auth">
	<h1>auth</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		This page is <code>/docs/auth</code>, the same name as <code>@nrynss/chaaya/auth</code>. The feature is a
		passcode gate. <code>GatePasscode</code> sends a caller-named header and cookie. It
		names no backend. An adapter is a function that fills those names. <code>keelGate</code> on
		<code>@nrynss/chaaya/keel</code> fills <code>X-Passcode</code>, the cookie <code>passcode</code>, and the
		code <code>passcode_required</code>.
	</p>
	<p>
		<code>authCodes</code> is a plain array checked with <code>includes</code>. A code named
		<code>constructor</code> is not an auth code unless it is in the list. <code>GateError</code> extends
		<code>ApiError</code>. <code>instanceof GateError</code> is the auth refusal. <code>detail</code> and
		<code>retryAfterSeconds</code> stay on that error.
	</p>
	<p>
		<code>{'apply({})'}</code> leaves <code>credentials</code> unset. Pass <code>credentials: "include"</code> to
		send the cookie. <code>keelGate</code> in <code>src/lib/adapters/keel/gate.ts</code> is the reference
		adapter. The adapter guide (#29) should point at that file when it is written.
	</p>
	<p>
		Importing the module does not touch <code>document</code>. Pass <code>jar: document</code> only in the
		browser. Omit the jar under SSR. Browser fetch hides <code>Set-Cookie</code>, so
		<code>remember()</code> does not read that header there. Node and undici still do. In a browser, use the JSON
		member <code>passcode</code>, or read the cookie the browser stored.
	</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
