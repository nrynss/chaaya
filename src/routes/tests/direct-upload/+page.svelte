<script lang="ts">
	import { page } from "$app/state";
	import { onMount } from "svelte";
	import {
		uploadDirectBlob,
		uploadDirectMultipart,
		type DirectCompletedPart
	} from "$lib/direct-upload/index.js";

	/** Run token the spec passes in. It scopes the server store per test. */
	const run = page.url.searchParams.get("run") ?? "default";

	/** Part URL for one part number inside this run. */
	function partUrl(partNumber: number): string {
		return `/tests/direct-upload/parts/${encodeURIComponent(run)}/${partNumber}`;
	}

	/** Complete URL inside this run. */
	function completeUrl(): string {
		return `/tests/direct-upload/complete?scope=${encodeURIComponent(run)}`;
	}

	/** Bytes URL inside this run. */
	function bytesUrl(): string {
		return `/tests/direct-upload/bytes?scope=${encodeURIComponent(run)}`;
	}

	/** Total bytes the harness uploads. Four parts keep progress visible. */
	const byteLength = 512_000;

	/** Longest part in bytes. Four parts cover the blob above. */
	const partSize = 128_000;

	/** What the page is doing, for a spec to wait on. */
	type Phase = "idle" | "uploading" | "partial" | "done" | "failed";

	let phase = $state<Phase>("idle");
	let failure = $state("");
	let loaded = $state(0);
	let total = $state(0);
	let samples = $state(0);
	let receipt = $state("");
	let assembled = $state("");
	let hydrated = $state(false);
	let lastLoaded = $state(0);
	let monotonic = $state(true);

	/** Parts the first pass stored, so the resume pass skips them. */
	let completed = $state<DirectCompletedPart[]>([]);

	/** Deterministic bytes, so the server copy must match exactly. */
	function makeBytes(): Uint8Array<ArrayBuffer> {
		const bytes = new Uint8Array(byteLength);
		for (let index = 0; index < bytes.length; index += 1) {
			bytes[index] = index % 251;
		}
		return bytes;
	}

	/** Hex digest of bytes through Web Crypto. */
	async function digestOf(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
	}

	function noteProgress(next: number, all: number): void {
		if (next < lastLoaded) monotonic = false;
		lastLoaded = next;
		loaded = next;
		total = all;
		samples += 1;
	}

	/** Upload every part in one session and close it. */
	async function upload(): Promise<void> {
		if (phase === "uploading") return;
		failure = "";
		receipt = "";
		assembled = "";
		completed = [];
		lastLoaded = 0;
		loaded = 0;
		total = 0;
		samples = 0;
		monotonic = true;
		phase = "uploading";
		try {
			const bytes = makeBytes();
			const blob = new Blob([bytes], { type: "video/mp4" });
			const answer = await uploadDirectMultipart<{ sha256: string; size: number }>(
				blob,
				{
					create: async () => ({ uploadId: "harness" }),
					partUrl: (_uploadId, partNumber) => partUrl(partNumber),
					complete: async (_uploadId, parts) => {
						const response = await fetch(completeUrl(), {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ parts })
						});
						if (!response.ok) throw new Error(`the close answered ${response.status}`);
						return (await response.json()) as { sha256: string; size: number };
					}
				},
				{
					partSize,
					onProgress: noteProgress,
					onPart: (part) => {
						completed = [...completed, part];
					}
				}
			);
			receipt = answer.sha256;
			const reading = await (await fetch(bytesUrl())).json();
			assembled = (reading as { sha256: string }).sha256;
			phase = "done";
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
			phase = "failed";
		}
	}

	/** Store the first two parts alone, so the resume pass proves the skip. */
	async function uploadPartial(): Promise<void> {
		if (phase === "uploading") return;
		failure = "";
		receipt = "";
		assembled = "";
		completed = [];
		lastLoaded = 0;
		loaded = 0;
		total = 0;
		samples = 0;
		monotonic = true;
		phase = "uploading";
		try {
			const bytes = makeBytes();
			const landed: DirectCompletedPart[] = [];
			for (const partNumber of [1, 2]) {
				const start = (partNumber - 1) * partSize;
				const slice = new Blob([bytes.slice(start, start + partSize)], { type: "video/mp4" });
				const etag = await uploadDirectBlob(partUrl(partNumber), slice, {
					onProgress: noteProgress
				});
				landed.push({ partNumber, etag });
			}
			completed = landed;
			loaded = partSize * 2;
			total = bytes.length;
			phase = "partial";
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
			phase = "failed";
		}
	}

	/** Finish the partial pass with the stored parts attached. */
	async function resume(): Promise<void> {
		if (phase !== "partial") return;
		failure = "";
		phase = "uploading";
		try {
			const bytes = makeBytes();
			const blob = new Blob([bytes], { type: "video/mp4" });
			const before = completed.length;
			const answer = await uploadDirectMultipart<{ sha256: string; size: number }>(
				blob,
				{
					create: async () => ({ uploadId: "harness" }),
					partUrl: (_uploadId, partNumber) => partUrl(partNumber),
					complete: async (_uploadId, parts) => {
						const response = await fetch(completeUrl(), {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ parts })
						});
						if (!response.ok) throw new Error(`the close answered ${response.status}`);
						return (await response.json()) as { sha256: string; size: number };
					}
				},
				{
					partSize,
					completed,
					onProgress: noteProgress,
					onPart: (part) => {
						if (completed.every((held) => held.partNumber !== part.partNumber)) {
							completed = [...completed, part];
						}
					}
				}
			);
			receipt = answer.sha256;
			const reading = await (await fetch(bytesUrl())).json();
			assembled = (reading as { sha256: string }).sha256;
			completed = [...completed].sort((left, right) => left.partNumber - right.partNumber);
			void before;
			phase = "done";
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
			phase = "failed";
		}
	}

	onMount(() => {
		hydrated = true;
		void digestOf(makeBytes());
	});
</script>

<main>
	<h1>Direct upload harness</h1>
	<dl>
		<dt>Phase</dt>
		<dd data-testid="phase">{phase}</dd>
		<dt>Loaded</dt>
		<dd data-testid="loaded">{loaded}</dd>
		<dt>Total</dt>
		<dd data-testid="total">{total}</dd>
		<dt>Samples</dt>
		<dd data-testid="samples">{samples}</dd>
		<dt>Monotonic</dt>
		<dd data-testid="monotonic">{monotonic ? "yes" : "no"}</dd>
		<dt>Parts</dt>
		<dd data-testid="parts">{completed.length}</dd>
		<dt>Receipt</dt>
		<dd data-testid="receipt">{receipt}</dd>
		<dt>Assembled</dt>
		<dd data-testid="assembled">{assembled}</dd>
		<dt>Failure</dt>
		<dd data-testid="failure">{failure}</dd>
		<dt>Hydrated</dt>
		<dd data-testid="hydrated">{hydrated ? "ready" : ""}</dd>
	</dl>
	<button type="button" data-testid="upload" disabled={!hydrated || phase === "uploading"} onclick={upload}>
		Upload
	</button>
	<button type="button" data-testid="partial" disabled={!hydrated || phase === "uploading"} onclick={uploadPartial}>
		Upload partial
	</button>
	<button type="button" data-testid="resume" disabled={!hydrated || phase !== "partial"} onclick={resume}>
		Resume
	</button>
</main>
