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
	<title>upload</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-upload">
	<h1>upload</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		<code>Uploader</code> on <code>@nrynss/chaaya/core</code> is chunked and resumable:
		<code>start</code>, <code>append</code>, <code>finish</code>. An adapter implements it. A large file
		belongs there.
	</p>
	<p>
		<code>uploadBlob</code> on <code>@nrynss/chaaya/upload</code> sends one body and cannot resume. A browser
		reports socket progress through <code>XMLHttpRequest</code>. A host with no <code>XMLHttpRequest</code>
		uses fetch and calls <code>onProgress</code> once after settle, because fetch cannot see the socket.
	</p>
	<p>
		<code>maxBytes</code> refuses an oversized blob before the request. On <code>FormData</code> it throws
		<code>UploadSizeUnknown</code>. The form has no size until the browser encodes it, so the limit is not
		skipped in silence.
	</p>
	<h2>Presigned PUT</h2>
	<p>
		Direct-to-storage is a raw body. Use <code>method: "PUT"</code>, <code>formData: false</code>, and
		<code>credentials: "omit"</code> so cookies stay off the store. Set <code>content-type</code> only when
		the signer requires it. Do not send an app token unless the URL asked for one.
	</p>
	<p>The same option takes <code>credentials: "include"</code> for an app route that uses a cookie.</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
