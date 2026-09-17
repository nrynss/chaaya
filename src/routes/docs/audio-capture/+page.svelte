<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { a11yGate, contrastGate } from "$lib/testing/index.js";
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
	let sharedContext: AudioContext | null = null;
	let checks = $state("");
	let checkFailure = $state("");

	onMount(() => {
		hydrated = true;
	});

	/** The page wide context the signal and the recorder share. The recorder
	 * never closes it, so the page keeps its clock between takes. */
	async function shared(): Promise<AudioContext> {
		if (!sharedContext) {
			sharedContext = new AudioContext({ sampleRate: SIGNAL.sampleRate });
			await sharedContext.resume();
		}
		return sharedContext;
	}

	/** Build the generated source on the shared context and hand its stream
	 * to the recorder. The page builds the signal itself, so no check opens
	 * a device. */
	async function buildStream(): Promise<GeneratedStream> {
		const context = await shared();
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
				try {
					source.stop();
				} catch {
					// A stopped source throws, and the take already ended.
				}
				source.disconnect();
				destination.disconnect();
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
			const context = await shared();
			const take = new AudioRecorder({ mode: next, context, autoStopSeconds: 2 });
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

	/** Run the gate pair on this page. The pairs name every colour pair the
	 * markup draws, so the gate measures each one. */
	async function runChecks(): Promise<void> {
		checks = "";
		checkFailure = "";
		try {
			const container = document.querySelector<HTMLElement>("[data-testid='docs-audio-capture']");
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
	<title>audio capture</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-audio-capture">
	<h1>audio capture</h1>
	<p>The device trio stays one decision. Echo cancellation stays on, and
		noise suppression and gain control stay off, for a session that also
		runs a voice model.</p>
	<p data-testid="failure">{failure}</p>
	<button type="button" data-testid="record-compressed" disabled={!hydrated} onclick={() => record("compressed")}>
		Record compressed
	</button>
	<button type="button" data-testid="record-pcm" disabled={!hydrated} onclick={() => record("pcm")}>
		Record PCM
	</button>
	<button type="button" data-testid="stop" disabled={!hydrated} onclick={stop}>Stop</button>
	<button type="button" data-testid="run-checks" disabled={!hydrated} onclick={runChecks}>Run checks</button>
	<p data-testid="checks">{checks}</p>
	<p data-testid="check-failure">{checkFailure}</p>
	<dl>
		<dt>Mode</dt>
		<dd data-testid="mode">{mode === "" ? "none" : mode}</dd>
		<dt>State</dt>
		<dd data-testid="state">{recorder?.state ?? "idle"}</dd>
		<dt>Chunks</dt>
		<dd data-testid="chunks">{recorder?.chunkCount ?? 0}</dd>
		<dt>Render rate</dt>
		<dd data-testid="render-rate">{recorder?.renderRate ?? 0}</dd>
		<dt>Mime</dt>
		<dd data-testid="mime">{recorder?.result?.mimeType ?? ""}</dd>
		<dt>Rate</dt>
		<dd data-testid="rate">{recorder?.result?.sampleRate ?? 0}</dd>
		<dt>Bytes</dt>
		<dd data-testid="size">{recorder?.result?.blob.size ?? 0}</dd>
	</dl>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
