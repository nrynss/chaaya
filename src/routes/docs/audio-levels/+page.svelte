<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { LiveLevel } from "$lib/audio/levels/live-level.svelte.js";

	let hydrated = $state(false);
	let phase = $state("idle");
	let silenceRms = $state("");
	let silencePeak = $state("");
	let toneRms = $state("");
	let tonePeak = $state("");
	let failure = $state("");

	onMount(() => {
		hydrated = true;
	});

	const format = (value: number): string => value.toFixed(3);

	function wait(ms: number): Promise<void> {
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, ms);
		return promise;
	}

	/** A full scale sine, so the peak meter reads zero dBFS. */
	function buildTone(context: AudioContext): AudioBufferSourceNode {
		const rate = 48000;
		const frames = rate;
		const samples = new Float32Array(frames);
		for (let index = 0; index < frames; index += 1) {
			samples[index] = Math.sin((2 * Math.PI * 440 * index) / rate);
		}
		const buffer = context.createBuffer(1, samples.length, rate);
		buffer.getChannelData(0).set(samples);
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		return source;
	}

	async function run(): Promise<void> {
		phase = "running";
		failure = "";
		try {
			const context = new AudioContext();
			await context.resume();
			const analyser = context.createAnalyser();
			analyser.fftSize = 2048;
			const sink = context.createMediaStreamDestination();
			analyser.connect(sink);
			const mute = context.createGain();
			mute.gain.value = 0;
			analyser.connect(mute);
			mute.connect(context.destination);
			const live = new LiveLevel(analyser);

			const silence = live.read();
			silenceRms = format(silence.rmsDb);
			silencePeak = format(silence.peakDb);

			const source = buildTone(context);
			source.connect(analyser);
			source.start();
			let tone = live.read();
			for (let attempt = 0; attempt < 12; attempt += 1) {
				await wait(50);
				const next = live.read();
				if (next.rmsDb > tone.rmsDb) tone = next;
				if (tone.rmsDb > -6) break;
			}
			source.stop();
			source.disconnect();
			toneRms = format(tone.rmsDb);
			tonePeak = format(tone.peakDb);
			await context.close();
			phase = "done";
		} catch (error) {
			failure = String(error);
			phase = "failed";
		}
	}
</script>

<svelte:head>
	<title>audio levels</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-audio-levels">
	<h1>audio levels</h1>
	<button type="button" data-testid="run" disabled={!hydrated} onclick={run}>Measure</button>
	<p data-testid="phase">{phase}</p>
	<p data-testid="failure">{failure}</p>
	<p data-testid="silence-rms">{silenceRms}</p>
	<p data-testid="silence-peak">{silencePeak}</p>
	<p data-testid="tone-rms">{toneRms}</p>
	<p data-testid="tone-peak">{tonePeak}</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
