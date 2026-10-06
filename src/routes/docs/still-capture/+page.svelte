<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { a11yGate, contrastGate } from "$lib/testing/index.js";

	const example = [
		'import { CameraSession, prepareImage } from "@nrynss/chaaya/capture";',
		'import { uploadBlob } from "@nrynss/chaaya/upload";',
		"",
		"const session = new CameraSession();",
		"session.bind(video);",
		"await session.start({ facing: \"user\" });",
		"const frame = await session.capture();",
		"const still = await prepareImage(frame, { maxLongSide: 1024, maxBytes: 400000 });",
		"await uploadBlob(\"/stills\", still.blob, { filename: \"still.jpg\" });",
		"session.stop();"
	].join("\n");

	let hydrated = $state(false);
	let checks = $state("");
	let checkFailure = $state("");

	onMount(() => {
		hydrated = true;
	});

	/** Run the gate pair on this page. The pairs name every colour pair the markup draws. */
	async function runChecks(): Promise<void> {
		checks = "";
		checkFailure = "";
		try {
			const container = document.querySelector<HTMLElement>("[data-testid='docs-still-capture']");
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
	<title>still capture</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-still-capture">
	<h1>still capture</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		<code>CameraSession</code> on <code>@nrynss/chaaya/capture</code> opens the camera on an element
		the app renders. Phases run <code>idle</code>, <code>requesting</code>, <code>live</code>,
		<code>denied</code>, <code>unavailable</code>, and <code>failed</code>, with the reason behind
		the unhappy three. The camera opens only inside a gesture. The session stops its tracks when the
		page hides and when the app stops or destroys it.
	</p>
	<p>
		A grab draws the raw frame, so a mirrored preview still saves unmirrored. The session renders
		no UI. The app owns the video element, the shutter control, and any mirror style.
	</p>
	<p>
		<code>prepareImage</code> takes any blob, applies EXIF orientation so the pixels stand upright,
		scales the long side to the cap, and re-encodes. Re-encoding drops EXIF, including GPS. Quality
		steps down until the blob fits the byte ceiling. The result enters the one-shot upload path
		unchanged.
	</p>
	<p>
		One seam covers every backend. A live session, a file picker, and a native camera each produce
		an <code>ImageCaptureBackend</code>, so the app switches backends without changing its flow.
	</p>
	<pre data-testid="example">{example}</pre>
	<button type="button" data-testid="run-checks" disabled={!hydrated} onclick={runChecks}>Run checks</button>
	<p data-testid="checks">{checks}</p>
	<p data-testid="check-failure">{checkFailure}</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
