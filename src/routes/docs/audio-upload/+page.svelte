<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { ChunkUploader, type SessionRecord, type StoredChunk, type UploadStore } from "$lib/audio/upload/index.js";

	/** The longest chunk the uploader sends. A small chunk keeps several
	 * chunks inside one short take. */
	const chunkSize = 4096;

	/** A store that keeps chunks in memory. The docs page uploads generated
	 * bytes, so nothing must survive a reload here. */
	function memoryStore(): UploadStore {
		const sessions: Record<string, SessionRecord> = {};
		const chunks: Record<string, StoredChunk[]> = {};
		let newest: string | undefined = undefined;
		return {
			async putSession(record) {
				sessions[record.id] = record;
				newest = record.id;
			},
			async latestSession() {
				return newest === undefined ? undefined : sessions[newest];
			},
			async deleteSession(id) {
				delete sessions[id];
				if (newest === id) newest = undefined;
			},
			async putChunk(chunk) {
				const list = chunks[chunk.id] ?? [];
				list.push(chunk);
				chunks[chunk.id] = list;
			},
			async listChunks(id) {
				return (chunks[id] ?? []).slice().sort((left, right) => left.index - right.index);
			},
			async deleteChunks(id) {
				delete chunks[id];
			}
		};
	}

	type Phase = "idle" | "uploading" | "done" | "failed";

	let phase = $state<Phase>("idle");
	let uploader = $state<ChunkUploader | null>(null);
	let failure = $state("");
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	/** A short generated take, split into fixed chunks and streamed to the
	 * docs route beside this page. The bytes come from a sine, so the page
	 * needs no device and no recorder. */
	async function start(): Promise<void> {
		if (phase === "uploading") return;
		failure = "";
		phase = "uploading";
		try {
			const rate = 48000;
			const frames = rate;
			const samples = new Float32Array(frames);
			for (let index = 0; index < frames; index += 1) {
				samples[index] = 0.5 * Math.sin((2 * Math.PI * 440 * index) / rate);
			}
			const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
			const next = new ChunkUploader({
				url: "/docs/audio-upload/uploads",
				owner: "docs-owner",
				contentType: "audio/pcm",
				chunkSize,
				store: memoryStore()
			});
			uploader = next;
			await next.start();
			next.append(bytes);
			await next.finish();
			phase = next.state === "done" ? "done" : "failed";
			if (next.state !== "done") failure = next.error?.message ?? "the upload did not finish";
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
			phase = "failed";
		}
	}
</script>

<svelte:head>
	<title>audio upload</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-audio-upload">
	<h1>audio upload</h1>
	<button type="button" data-testid="start" disabled={!hydrated} onclick={start}>Upload</button>
	<p data-testid="phase">{phase}</p>
	<p data-testid="failure">{failure}</p>
	<dl>
		<dt>State</dt>
		<dd data-testid="state">{uploader?.state ?? "none"}</dd>
		<dt>Id</dt>
		<dd data-testid="id">{uploader?.id ?? ""}</dd>
		<dt>Captured</dt>
		<dd data-testid="captured">{uploader?.capturedBytes ?? 0}</dd>
		<dt>Acknowledged</dt>
		<dd data-testid="acknowledged">{uploader?.acknowledged ?? 0}</dd>
		<dt>Stored</dt>
		<dd data-testid="stored">{uploader?.stored ?? 0}</dd>
		<dt>Receipt</dt>
		<dd data-testid="receipt">{uploader?.receipt?.sha256 ?? ""}</dd>
	</dl>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
