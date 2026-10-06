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
		<code>uploadBlob</code> on <code>@nrynss/chaaya/upload</code> sends one body with fetch and cannot resume.
		<code>onProgress</code> fires once, after settle. <code>uploadBlobWithProgress</code> uses
		<code>XMLHttpRequest</code>, so <code>onProgress</code> is socket progress before the response. It does
		not fall back to fetch. Neither function is exported from <code>@nrynss/chaaya/core</code>.
	</p>
	<p>
		<code>uploadDirectBlob</code> and <code>uploadDirectMultipart</code> on
		<code>@nrynss/chaaya/direct-upload</code> send raw bodies straight to caller supplied URLs. A large
		file on foreign URLs belongs there. Parts travel in number order, one at a time. Parts listed in
		<code>completed</code> are skipped, so an interrupted session resumes. Each part retries busy
		answers. Use chunked <code>Uploader</code> for app routes with an adapter, one-shot for one
		request with no resume, and direct multipart for many part URLs.
	</p>
	<p>
		<code>credentials</code> is one option. Fetch receives it as-is. XMLHttpRequest sets
		<code>withCredentials</code> only for <code>"include"</code>, and that flag only affects cross-origin
		requests. Same-origin XHR always sends cookies.
	</p>
	<p>
		<code>timeoutMs</code> is a positive number of milliseconds, or omitted for no deadline. Zero is
		refused. Fetch would abort immediately, and XMLHttpRequest would treat zero as no timeout.
	</p>
	<p>
		<code>maxBytes</code> refuses an oversized blob before the request. On <code>FormData</code> without
		<code>size</code> it throws <code>UploadSizeUnknown</code>: set <code>maxBytes</code> only for Blob
		bodies, or pass an explicit size. The limit is not skipped in silence.
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
