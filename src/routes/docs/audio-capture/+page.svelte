<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { AudioRecorder, type CaptureMode } from "$lib/audio/capture/index.js";

	/** The generated signal this page records in place of a device. */
	const SIGNAL = {
		sampleRate: 48000,
		totalSeconds: 1.5,
		toneHz: 220,
		markerHz: 2000,
		toneAmplitude: 0.25,
		markerAmplitude: 0.9,
		markerIntervalMs: 100,
		markerMs: 25,
		omitMarkerIndex: 0
	};

	type GeneratedStream = {
		readonly stream: MediaStream;
		readonly stop: () => void;
	};

	let recorder = $state<AudioRecorder | null>(null);
	let hydrated = $state(false);
	let failure = $state("");
	let mode = $state("");
	let wrapped: { stop: () => void } | null = null;

	onMount(() => {
		hydrated = true;
	});

	/** Build the generated source inside the page and hand its stream to
	 * the recorder. The page builds the signal itself, so no check opens
	 * a device. */
	async function buildStream(): Promise<GeneratedStream> {
		const context = new AudioContext({ sampleRate: SIGNAL.sampleRate });
		await context.resume();
		const frames = Math.round(SIGNAL.totalSeconds * SIGNAL.sampleRate);
		const samples = new Float32Array(frames);
		for (let index = 0; index < frames; index += 1) {
			const time = index / SIGNAL.sampleRate;
			const slot = Math.floor(time / (SIGNAL.markerIntervalMs / 1000));
			const inSlot = time - slot * (SIGNAL.markerIntervalMs / 1000);
			let value = SIGNAL.toneAmplitude * Math.sin(2 * Math.PI * SIGNAL.toneHz * time);
			if (slot !== SIGNAL.omitMarkerIndex && inSlot < SIGNAL.markerMs / 1000) {
				value += SIGNAL.markerAmplitude * Math.sin(2 * Math.PI * SIGNAL.markerHz * time);
			}
			samples[index] = value;
		}
		const buffer = context.createBuffer(1, samples.length, SIGNAL.sampleRate);
		buffer.getChannelData(0).set(samples);
		const source = context.createBufferSource();
		source.buffer = buffer;
		const destination = context.createMediaStreamDestination();
		source.connect(destination);
		source.start();
		return {
			stream: destination.stream,
			stop: () => {
				source.stop();
				source.disconnect();
				destination.disconnect();
				void context.close();
			}
		};
	}

	async function record(next: CaptureMode): Promise<void> {
		failure = "";
		mode = next;
		try {
			const generated = await buildStream();
			wrapped?.stop();
			wrapped = generated;
			const media = navigator.mediaDevices;
			const inner = media.getUserMedia.bind(media);
			media.getUserMedia = async () => generated.stream;
			const take = new AudioRecorder({ mode: next, autoStopSeconds: 2 });
			recorder = take;
			try {
				await take.start();
			} finally {
				media.getUserMedia = inner;
			}
		} catch (error) {
			failure = String(error);
		}
	}

	async function stop(): Promise<void> {
		await recorder?.stop();
		wrapped?.stop();
		wrapped = null;
	}
</script>

<svelte:head>
	<title>audio capture</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-audio-capture">
	<h1>audio capture</h1>
	<p data-testid="failure">{failure}</p>
	<button type="button" data-testid="record-compressed" disabled={!hydrated} onclick={() => record("compressed")}>
		Record compressed
	</button>
	<button type="button" data-testid="record-pcm" disabled={!hydrated} onclick={() => record("pcm")}>
		Record PCM
	</button>
	<button type="button" data-testid="stop" disabled={!hydrated} onclick={stop}>Stop</button>
	<dl>
		<dt>Mode</dt>
		<dd data-testid="mode">{mode === "" ? "none" : mode}</dd>
		<dt>State</dt>
		<dd data-testid="state">{recorder?.state ?? "idle"}</dd>
		<dt>Chunks</dt>
		<dd data-testid="chunks">{recorder?.chunkCount ?? 0}</dd>
		<dt>Mime</dt>
		<dd data-testid="mime">{recorder?.result?.mimeType ?? ""}</dd>
		<dt>Rate</dt>
		<dd data-testid="rate">{recorder?.result?.sampleRate ?? 0}</dd>
		<dt>Bytes</dt>
		<dd data-testid="size">{recorder?.result?.blob.size ?? 0}</dd>
	</dl>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
