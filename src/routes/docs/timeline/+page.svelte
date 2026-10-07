<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { TimelineScale, timelineHandle } from "$lib/timeline/index.js";
	import type { TimelineSegment } from "$lib/timeline/index.js";
	import { a11yGate, contrastGate } from "$lib/testing/index.js";

	const scale = new TimelineScale(50, 0);
	const bounds = { start: 0, end: 10 };
	const neighbours: TimelineSegment[] = [{ start: 6, end: 7 }];
	const targets = [2, 5];
	const playhead = 2.5;

	let segment = $state<TimelineSegment>({ start: 1, end: 3 });
	let snapped = $state("none");
	let committed = $state("none");
	let hydrated = $state(false);
	let gates = $state("idle");
	let gateFailure = $state("");

	const pairs = [
		["text", "surface"],
		["dim", "surface"],
		["accent", "surface"],
		["on-accent", "accent"]
	] as const;

	const ticks = $derived(scale.ticks(scale.visible(400).start, scale.visible(400).end, 80));
	const playheadPixels = $derived(scale.secondsToPixels(playhead));

	function base(kind: "move" | "start" | "end", label: string) {
		return {
			kind,
			label,
			initial: segment,
			read: () => segment,
			pixelsPerSecond: () => scale.pixelsPerSecond,
			bounds,
			neighbours: () => neighbours,
			snapTargets: () => targets,
			snapThreshold: 0.25,
			minLength: 0.5,
			onPreview: (next: TimelineSegment, target: number | null) => {
				segment = next;
				snapped = target === null ? "none" : target.toFixed(2);
			},
			onCommit: (next: TimelineSegment, target: number | null) => {
				segment = next;
				snapped = target === null ? "none" : target.toFixed(2);
				committed = `${next.start.toFixed(2)} to ${next.end.toFixed(2)}`;
			},
			onCancel: (next: TimelineSegment) => {
				segment = next;
				committed = `cancelled, back to ${next.start.toFixed(2)} to ${next.end.toFixed(2)}`;
			}
		} as const;
	}

	const startHandle = timelineHandle(base("start", "Move segment start"));
	const moveHandle = timelineHandle(base("move", "Move segment"));
	const endHandle = timelineHandle(base("end", "Move segment end"));

	function zoomIn(): void {
		scale.zoom(2, segment.start);
	}

	function zoomOut(): void {
		scale.zoom(0.5, segment.start);
	}

	async function runGates(): Promise<void> {
		gates = "running";
		gateFailure = "";
		try {
			const container = document.querySelector<HTMLElement>("[data-testid='docs-timeline']");
			if (!container) throw new Error("the markup is missing");
			await a11yGate(container);
			contrastGate(referenceCss, pairs);
			gates = "done";
		} catch (error) {
			gateFailure = error instanceof Error ? error.message.split("\n")[0] : String(error);
			gates = "failed";
		}
	}

	onMount(() => {
		hydrated = true;
	});
</script>

<svelte:head>
	<title>timeline</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-timeline">
	<h1>timeline</h1>
	<p>A timeline maps seconds to pixels under zoom and scroll. One scale holds the density and the offset, and pure functions map both ways and choose ruler ticks. A ruler, tracks, and a playhead read that one source.</p>
	<p>A segment moves and resizes against snap targets. Bounds, a minimum length, and neighbours constrain every edit, and each edit names the target it snapped to.</p>
	<p>A handle turns any element into an edge or body control. It drags with pointer capture, cancels with Escape, and nudges with arrow keys. Shift steps coarsely and Alt steps finely. It draws nothing, and it carries the role, the value, and the spoken time.</p>
	<p>The demo below wires three handles to one segment. Drag a handle with the pointer, or focus it and press the arrows. Escape restores the start.</p>
	<section aria-label="Scale">
		<p data-testid="density">{scale.pixelsPerSecond} pixels per second</p>
		<p data-testid="ticks">{ticks.join(", ")}</p>
		<p data-testid="playhead">playhead at {playheadPixels} pixels</p>
		<button type="button" data-testid="zoom-in" disabled={!hydrated} onclick={zoomIn}>
			Zoom in
		</button>
		<button type="button" data-testid="zoom-out" disabled={!hydrated} onclick={zoomOut}>
			Zoom out
		</button>
	</section>
	<section aria-label="Segment">
		<p data-testid="segment">{segment.start.toFixed(2)} to {segment.end.toFixed(2)}</p>
		<p data-testid="snapped">snapped to {snapped}</p>
		<p data-testid="committed">{committed}</p>
		<div data-testid="handle-start" {@attach startHandle} style="width: 20px; height: 20px;">
			start
		</div>
		<div data-testid="handle-move" {@attach moveHandle} style="width: 60px; height: 20px;">
			move
		</div>
		<div data-testid="handle-end" {@attach endHandle} style="width: 20px; height: 20px;">
			end
		</div>
	</section>
	<dl>
		<dt>Gates</dt>
		<dd data-testid="gates">{gates}</dd>
		<dt>Gate failure</dt>
		<dd data-testid="gate-failure">{gateFailure}</dd>
	</dl>
	<button type="button" data-testid="run-gates" disabled={!hydrated} onclick={runGates}>
		Run gates
	</button>
	<section aria-label="Sample">
		<div data-testid="sample-text" style="background: var(--surface); color: var(--text);">sample text</div>
		<div data-testid="sample-dim" style="background: var(--surface); color: var(--dim);">sample dim</div>
		<div data-testid="sample-accent" style="background: var(--accent); color: var(--on-accent);">sample accent</div>
		<a href={resolve("/docs")}>back</a>
	</section>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
