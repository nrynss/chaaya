<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { a11yGate, contrastGate } from "$lib/testing/index.js";
	import { PcmStreamPlayer } from "$lib/audio/playback/stream.svelte.js";

	let player = $state<PcmStreamPlayer | null>(null);
	let context = $state<AudioContext | null>(null);
	let hydrated = $state(false);
	let checks = $state("");
	let checkFailure = $state("");

	onMount(() => {
		hydrated = true;
	});

	/** One short block of silence, enough to light every readout. */
	function block(): Float32Array {
		return new Float32Array(4800);
	}

	/** Open the playback context inside the gesture and schedule on it.
	 * The player never closes the context, so the page keeps its clock. */
	async function open(): Promise<void> {
		context?.close().catch(() => undefined);
		const next = new AudioContext();
		await next.resume();
		context = next;
		player = new PcmStreamPlayer({ context: next });
	}

	function push(): void {
		player?.push(block());
	}

	function flush(): void {
		player?.flush();
	}

	/** Run the gate pair on this page. The pairs name every colour pair the
	 * markup draws, so the gate measures each one. */
	async function runChecks(): Promise<void> {
		checks = "";
		checkFailure = "";
		try {
			const container = document.querySelector<HTMLElement>("[data-testid='docs-audio-stream']");
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
	<title>audio stream</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-audio-stream">
	<h1>audio stream</h1>
	<p>A live reply arrives as PCM blocks with no length and no container.
		The player schedules each block on the context capture already runs
		on. The next block starts where the last one ends, and a late block
		starts at now plus a small lead, so it never lands in the past. A
		flush stops playback and reports the cut time. A gap the scheduler
		could not avoid stays visible as an underrun.</p>
	<p>Build the player on the shared context inside the first gesture. Push
		each arriving block, and record each reported start time as the track
		the take played. Flush to mark an interruption at the reported cut.</p>
	<button type="button" data-testid="open" disabled={!hydrated} onclick={open}>Open</button>
	<button type="button" data-testid="push" disabled={!hydrated} onclick={push}>Push</button>
	<button type="button" data-testid="flush" disabled={!hydrated} onclick={flush}>Flush</button>
	<button type="button" data-testid="run-checks" disabled={!hydrated} onclick={runChecks}>
		Run checks
	</button>
	<p data-testid="checks">{checks}</p>
	<p data-testid="check-failure">{checkFailure}</p>
	<dl>
		<dt>Blocks</dt>
		<dd data-testid="blocks">{player?.blocks.length ?? 0}</dd>
		<dt>Underruns</dt>
		<dd data-testid="underruns">{player?.underruns ?? 0}</dd>
		<dt>Cut</dt>
		<dd data-testid="cut">{player?.lastCut ?? ""}</dd>
	</dl>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
