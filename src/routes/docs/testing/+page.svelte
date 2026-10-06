<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { a11yGate, assertErrorEnvelope, assertJobProgress, assertSseFrame, contrastGate } from "$lib/testing/index.js";

	let hydrated = $state(false);
	let phase = $state("idle");
	let a11y = $state("");
	let contrast = $state("");
	let protocol = $state("");
	let failure = $state("");

	onMount(() => {
		hydrated = true;
	});

	/** The pairs this markup draws, foreground over background. The names
	 * stay inside the hex set the reference file declares, so the gate
	 * measures every theme block the file defines. */
	const pairs = [
		["text", "surface"],
		["dim", "surface"],
		["accent", "surface"],
		["on-accent", "accent"],
		["ok", "surface"],
		["warn", "surface"],
		["stop", "surface"]
	] as const;

	async function run(): Promise<void> {
		phase = "running";
		failure = "";
		a11y = "";
		contrast = "";
		protocol = "";
		try {
			const container = document.querySelector<HTMLElement>("[data-testid='docs-testing']");
			if (!container) throw new Error("the markup is missing");
			await a11yGate(container);
			a11y = "pass";
			contrastGate(referenceCss, pairs);
			contrast = "pass";
			// The protocol asserts check adapter shapes, not this page. Fixed
			// samples prove they run beside the gates a consumer points at
			// its own markup.
			assertSseFrame({ kind: "event", id: 1, name: "progress", data: "{}", idSet: true });
			assertErrorEnvelope({ code: "failed", message: "the work stopped" });
			assertJobProgress({ id: "job-1", stage: "encode", current: 1, total: 3, status: "running" });
			protocol = "pass";
			phase = "done";
		} catch (error) {
			failure = error instanceof Error ? error.message.split("\n")[0] : String(error);
			phase = "failed";
		}
	}
</script>

<svelte:head>
	<title>testing</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-testing">
	<h1>testing</h1>
	<button type="button" data-testid="run" disabled={!hydrated} onclick={run}>Run gates</button>
	<p data-testid="phase">{phase}</p>
	<p data-testid="a11y">{a11y}</p>
	<p data-testid="contrast">{contrast}</p>
	<p data-testid="protocol">{protocol}</p>
	<p data-testid="failure">{failure}</p>
	<section aria-label="Sample">
		<div data-testid="sample-text" style="background: var(--surface); color: var(--text);">sample text</div>
		<div data-testid="sample-accent" style="background: var(--accent); color: var(--on-accent);">sample accent</div>
		<div data-testid="sample-ok" style="background: var(--surface); color: var(--ok);">sample ok</div>
		<div data-testid="sample-warn" style="background: var(--surface); color: var(--warn);">sample warn</div>
		<div data-testid="sample-stop" style="background: var(--surface); color: var(--stop);">sample stop</div>
		<a href={resolve("/docs")}>back</a>
	</section>
</main>
