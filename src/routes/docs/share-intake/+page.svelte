<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { a11yGate, contrastGate } from "$lib/testing/index.js";

	const manifest = [
		"{",
		'  "share_target": {',
		'    "action": "/share",',
		'    "method": "GET",',
		'    "params": {',
		'      "title": "title",',
		'      "text": "text",',
		'      "url": "url"',
		"    }",
		"  }",
		"}"
	].join("\n");

	const route = [
		"// src/routes/share/+page.svelte in an adapter-static build.",
		"// The shell prerenders. The payload reads on mount, then the",
		"// address bar cleans itself, so a reload shares nothing.",
		"",
		"import { consumeShareLaunch } from \"@nrynss/chaaya/share\";",
		"import { onMount } from \"svelte\";",
		"",
		"let payload = $state(null);",
		"",
		"onMount(() => {",
		"  payload = consumeShareLaunch(undefined, { path: \"/share\" }) ?? null;",
		"});"
	].join("\n");

	let hydrated = $state(false);
	let checks = $state("");
	let checkFailure = $state("");

	onMount(() => {
		hydrated = true;
	});

	/** Run the gate pair on this page. The pairs name every colour pair the markup draws. */
	async function runChecks(): Promise<void> {
		checks = "";
		checkFailure = "";
		try {
			const container = document.querySelector<HTMLElement>("[data-testid='docs-share-intake']");
			if (!container) throw new Error("the markup is missing");
			await a11yGate(container);
			contrastGate(referenceCss, [
				["text", "surface"],
				["dim", "surface"]
			]);
			checks = "pass";
		} catch (error) {
			checkFailure = error instanceof Error ? error.message.split("\n")[0] : String(error);
		}
	}
</script>

<svelte:head>
	<title>share intake</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-share-intake">
	<h1>share intake</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		<code>readSharedPayload</code> on <code>@nrynss/chaaya/share</code> normalises a launch URL
		into one payload with a <code>url</code>, a <code>text</code>, and a <code>title</code>. When
		the <code>url</code> param is missing, it pulls the first link out of the text, because that
		is where senders put it. A caller filter trims tracking params from the link.
	</p>
	<p>
		<code>consumeShareLaunch</code> reads the payload once on the share route, then replaces
		history so a reload shares nothing. A native shell emits the same shape through a
		<code>ShareSource</code>, so one handler serves the web share and a native intent.
	</p>
	<h2>Manifest</h2>
	<p>Paste the GET form into the app manifest. The params name the launch query.</p>
	<pre data-testid="manifest">{manifest}</pre>
	<h2>Route</h2>
	<p>Serve this route beside the manifest action. The shell prerenders under adapter-static.</p>
	<pre data-testid="route">{route}</pre>
	<button type="button" data-testid="run-checks" disabled={!hydrated} onclick={runChecks}>Run checks</button>
	<p data-testid="checks">{checks}</p>
	<p data-testid="check-failure">{checkFailure}</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
