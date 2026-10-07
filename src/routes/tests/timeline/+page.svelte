<script lang="ts">
	import { onMount } from "svelte";
	import { timelineHandle } from "$lib/timeline/index.js";
	import type { TimelineSegment } from "$lib/timeline/index.js";

	/* One segment at 1 to 3 seconds on a 50 pixel per second scale, so one
	 * second is 50 pixels. A neighbour holds 6 to 7, and snap targets sit at
	 * 2 and 5 with a quarter second reach. */
	const density = 50;
	const bounds = { start: 0, end: 10 };
	const neighbours: TimelineSegment[] = [{ start: 6, end: 7 }];
	const targets = [2, 5];

	let segment = $state<TimelineSegment>({ start: 1, end: 3 });
	let snapped = $state("none");
	let committed = $state("none");
	let cancelled = $state("none");
	let hydrated = $state(false);

	function note(segment: TimelineSegment, target: number | null): void {
		snapped = target === null ? "none" : target.toFixed(2);
	}

	function base(kind: "move" | "start" | "end", label: string) {
		return {
			kind,
			label,
			initial: segment,
			read: () => segment,
			pixelsPerSecond: () => density,
			bounds,
			neighbours: () => neighbours,
			snapTargets: () => targets,
			snapThreshold: 0.25,
			minLength: 0.5,
			onPreview: (next: TimelineSegment, target: number | null) => {
				segment = next;
				note(next, target);
			},
			onCommit: (next: TimelineSegment, target: number | null) => {
				segment = next;
				note(next, target);
				committed = `${next.start.toFixed(2)} to ${next.end.toFixed(2)}`;
			},
			onCancel: (next: TimelineSegment) => {
				segment = next;
				cancelled = `${next.start.toFixed(2)} to ${next.end.toFixed(2)}`;
			}
		} as const;
	}

	const startHandle = timelineHandle(base("start", "Move segment start"));
	const moveHandle = timelineHandle(base("move", "Move segment"));
	const endHandle = timelineHandle(base("end", "Move segment end"));

	onMount(() => {
		hydrated = true;
	});
</script>

<main data-testid="harness-timeline">
	<h1>Timeline harness</h1>
	<p data-testid="segment">{segment.start.toFixed(2)} to {segment.end.toFixed(2)}</p>
	<p data-testid="snapped">{snapped}</p>
	<p data-testid="committed">{committed}</p>
	<p data-testid="cancelled">{cancelled}</p>
	<div data-testid="track">
		<div data-testid="handle-start" {@attach startHandle} style="width: 20px; height: 20px;">
			start
		</div>
		<div data-testid="handle-move" {@attach moveHandle} style="width: 60px; height: 20px;">
			move
		</div>
		<div data-testid="handle-end" {@attach endHandle} style="width: 20px; height: 20px;">
			end
		</div>
	</div>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
</main>
