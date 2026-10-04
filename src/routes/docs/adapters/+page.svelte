<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { parseNamedFrame } from "$lib/core/index.js";
	import { onMount } from "svelte";
	import { plainErrorParser, plainFrameMap, writeDone, writeProgress } from "../../../../docs/examples/plain-adapter.js";

	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	const wire = [
		writeProgress({ id: 1, step: "encode", done: 2, of: 10, watch: "job-1" }),
		writeProgress({ id: 2, step: "encode", done: 10, of: 10, result: "/media/out.bin", watch: "job-1" }),
		writeDone(3, "job-1"),
	].join("");

	const first = parseNamedFrame(wire.split("\n\n")[0] ?? "");
	const action =
		first.ok && first.value.kind === "event"
			? plainFrameMap().progress({
					id: first.value.id,
					name: first.value.name,
					data: first.value.data,
					idSet: first.value.idSet,
				})
			: undefined;

	const refusal = plainErrorParser('{"failure":{"kind":"not_allowed","text":"Sign in."}}', new Response());
</script>

<svelte:head>
	<title>adapters</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-adapters">
	<h1>adapters</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		An adapter supplies <code>frameMap</code> and <code>parseError</code>. Core does not know the event names or the
		error document. <code>@nrynss/chaaya/keel</code> is one adapter. It is not the definition. The copy-pasteable
		example does not import it. The guide is <code>docs/adapters.md</code>, and the file is
		<code>docs/examples/plain-adapter.ts</code>.
	</p>
	<p>
		<code>ok</code>, <code>fail</code>, <code>isRecord</code>, and <code>decodeJson</code> parse a payload without
		throwing. A handler that throws is dropped and does not move <code>Last-Event-ID</code>. Return
		<code>ignore</code> instead. <code>shouldAccept</code>, <code>fetchState</code>, <code>isTerminal</code>, and
		<code>requestInit</code> are optional. <code>fetchState</code> resolves a catch-up, with the error beside the
		reading.
	</p>
	<p>
		The writer is <code>formatNamedFrame</code>. It returns frame text, not an HTTP response. The host sets
		<code>text/event-stream</code>. A passcode uses <code>GatePasscode</code> with the host's own names.
		<code>keelGate</code> in <code>src/lib/adapters/keel/gate.ts</code> is that same shape for one backend.
	</p>
	<pre data-testid="plain-wire">{wire}</pre>
	<pre data-testid="plain-action">{JSON.stringify(action)}</pre>
	<pre data-testid="plain-error">{JSON.stringify(refusal)}</pre>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
