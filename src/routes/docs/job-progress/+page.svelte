<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import type { JobProgress } from "$lib/core/progress.js";

	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	const stages = ["prepare", "encode", "finish"];

	const stageList: JobProgress = {
		id: "job-1",
		stage: stages[1],
		current: 1,
		total: stages.length,
		status: "running",
	};

	const encodePages: JobProgress = {
		id: "job-1",
		stage: "encode",
		current: 3,
		total: 12,
		status: "running",
		detail: { stageIndex: 1, stageCount: stages.length },
	};

	const encoded: JobProgress = {
		id: "job-1",
		stage: "encode",
		current: 12,
		total: 12,
		status: "running",
		detail: { url: "/media/out.bin", bytes: 48000 },
	};

	const upload: JobProgress = {
		id: "up-9",
		stage: "upload",
		current: 2,
		total: 5,
		status: "running",
	};

	function show(reading: JobProgress): string {
		return JSON.stringify(reading);
	}
</script>

<svelte:head>
	<title>job progress</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-job-progress">
	<h1>job progress</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		<code>JobProgress</code> lives in <code>@nrynss/chaaya/core</code>. It lists no event names and no
		terminal set. An adapter maps a wire snapshot onto this shape. An app maps its own domain onto the
		same shape.
	</p>
	<table>
		<caption>Fields</caption>
		<thead>
			<tr>
				<th scope="col">Field</th>
				<th scope="col">Meaning</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<th scope="row">id</th>
				<td>The job, when the producer named one.</td>
			</tr>
			<tr>
				<th scope="row">stage</th>
				<td>The step the job is on. Any string the app chooses.</td>
			</tr>
			<tr>
				<th scope="row">current</th>
				<td>Work done so far, in the one counter the view cares about.</td>
			</tr>
			<tr>
				<th scope="row">total</th>
				<td>How much that counter totals.</td>
			</tr>
			<tr>
				<th scope="row">status</th>
				<td>A status string the producer chose. Core does not decide which strings are terminal.</td>
			</tr>
			<tr>
				<th scope="row">detail</th>
				<td>Payload only the app reads.</td>
			</tr>
		</tbody>
	</table>
	<h2>Stage list</h2>
	<p>
		Keep the ordered names in the app. <code>current</code> and <code>total</code> are the index in that
		list. A finer counter inside one stage uses <code>current</code> and <code>total</code> for that
		counter, and keeps the outer index in <code>detail</code>.
	</p>
	<pre data-testid="stage-list">{show(stageList)}</pre>
	<pre data-testid="encode-pages">{show(encodePages)}</pre>
	<h2>Last progress reading</h2>
	<p>
		Put the app result in <code>detail</code> on the last progress reading. A later terminal frame stays
		thin: an id and a status. The same idea covers an upload, where the counter is parts or bytes.
	</p>
	<pre data-testid="encoded">{show(encoded)}</pre>
	<pre data-testid="upload">{show(upload)}</pre>
	<h2>Named events</h2>
	<p>
		An event that is not a step, a counter, or a status does not belong in <code>stage</code>. Publish it
		on a named event stream (<code>createEventStream</code>). Progress stays a <code>JobProgress</code>
		reading.
	</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
