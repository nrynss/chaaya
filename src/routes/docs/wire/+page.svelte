<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { parseErrorEnvelope, parseJobEvent } from "$lib/adapters/keel/wire/index.js";
	import errorRateLimited from "$lib/adapters/keel/wire/fixtures/error-rate-limited.json?raw";
	import eventProgress from "$lib/adapters/keel/wire/fixtures/event-progress.txt?raw";
	import eventDone from "$lib/adapters/keel/wire/fixtures/event-done.txt?raw";

	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	const envelope = $derived(parseErrorEnvelope(errorRateLimited));
	const envelopeCode = $derived(envelope.ok ? envelope.value.error.code : envelope.failure.message);
	const envelopeMessage = $derived(envelope.ok ? envelope.value.error.message : "");

	const progress = $derived(parseJobEvent(eventProgress));
	const progressStage = $derived(
		progress.ok && progress.value.name === "progress" ? progress.value.stage : ""
	);

	const done = $derived(parseJobEvent(eventDone));
	const doneStatus = $derived(
		done.ok && done.value.name === "done" ? done.value.status : ""
	);
</script>

<svelte:head>
	<title>wire</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-wire">
	<h1>wire</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<dl>
		<dt>Error code</dt>
		<dd data-testid="envelope-code">{envelopeCode}</dd>
		<dt>Error message</dt>
		<dd data-testid="envelope-message">{envelopeMessage}</dd>
		<dt>Progress stage</dt>
		<dd data-testid="progress-stage">{progressStage}</dd>
		<dt>Done status</dt>
		<dd data-testid="done-status">{doneStatus}</dd>
	</dl>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
