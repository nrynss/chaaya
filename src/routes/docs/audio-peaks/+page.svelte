<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { computePeaks, computePeaksInWorker } from "$lib/audio/index.js";

	let hydrated = $state(false);
	let phase = $state("idle");
	let bucketCount = $state("");
	let directMin = $state("");
	let directMax = $state("");
	let workerMin = $state("");
	let workerMax = $state("");
	let agreement = $state("");
	let failure = $state("");

	onMount(() => {
		hydrated = true;
	});

	const format = (value: number): string => value.toFixed(3);

	/** A long signal with a known high and low, so the peaks read back fixed values. */
	function synthesize(durationSeconds: number, rate: number): Float32Array {
		const frames = Math.floor(durationSeconds * rate);
		const samples = new Float32Array(frames);
		for (let index = 0; index < frames; index += 1) {
			samples[index] = index % 8000 < 4000 ? 0.5 : -0.9;
		}
		return samples;
	}

	async function run(): Promise<void> {
		phase = "running";
		failure = "";
		try {
			const samples = synthesize(20, 48000);
			const buckets = 80;
			const direct = computePeaks([samples.slice()], buckets);
			const worker = await computePeaksInWorker([samples], buckets);
			const low = direct.min.reduce((at, value) => Math.min(at, value), Infinity);
			const high = direct.max.reduce((at, value) => Math.max(at, value), -Infinity);
			bucketCount = String(direct.min.length);
			directMin = format(low);
			directMax = format(high);
			const workerLow = worker.min.reduce((at, value) => Math.min(at, value), Infinity);
			const workerHigh = worker.max.reduce((at, value) => Math.max(at, value), -Infinity);
			workerMin = format(workerLow);
			workerMax = format(workerHigh);
			const same =
				direct.min.length === worker.min.length &&
				direct.min.every((value, index) => value === worker.min[index]) &&
				direct.max.every((value, index) => value === worker.max[index]);
			agreement = same ? "agree" : "differ";
			phase = "done";
		} catch (error) {
			failure = String(error);
			phase = "failed";
		}
	}
</script>

<svelte:head>
	<title>audio peaks</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-audio-peaks">
	<h1>audio peaks</h1>
	<button type="button" data-testid="run" disabled={!hydrated} onclick={run}>Compute</button>
	<p data-testid="phase">{phase}</p>
	<p data-testid="failure">{failure}</p>
	<p data-testid="buckets">{bucketCount}</p>
	<p data-testid="direct-min">{directMin}</p>
	<p data-testid="direct-max">{directMax}</p>
	<p data-testid="worker-min">{workerMin}</p>
	<p data-testid="worker-max">{workerMax}</p>
	<p data-testid="agreement">{agreement}</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
