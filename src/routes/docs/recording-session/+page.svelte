<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import {
		createRecordingSession,
		type RecordingPhase,
		type RecordingSession
	} from "$lib/audio/session/index.js";
	import type { CaptureResult } from "$lib/audio/capture/types.js";

	const example = [
		'import { AudioRecorder, captureFromRecorder, createRecordingSession } from "@nrynss/chaaya/audio";',
		'import { uploadBlob } from "@nrynss/chaaya/upload";',
		"",
		"const recorder = new AudioRecorder({ mode: \"compressed\" });",
		"const session = createRecordingSession({",
		"\tcapture: captureFromRecorder(recorder),",
		"\tupload: {",
		"\t\tsend: (result, signal) =>",
		"\t\t\tuploadBlob(\"/takes\", result.blob, {",
		"\t\t\t\tsignal,",
		"\t\t\t\tfilename: \"take.webm\",",
		"\t\t\t}),",
		"\t},",
		"});",
		"",
		"await session.start();",
		"await session.stop();",
	].join("\n");

	let hydrated = $state(false);
	let phase = $state<RecordingPhase>("idle");
	let note = $state("Press start. This page uses an in-memory capture, not a microphone.");
	let session: RecordingSession | null = null;

	onMount(() => {
		hydrated = true;
		session = build();
		phase = session.phase;
	});

	/** A capture that can pause, so the page can show the hold. */
	function build(): RecordingSession {
		let running = false;
		let result: CaptureResult | null = null;
		const bytes = new Blob(["take"], { type: "audio/webm" });
		const next = createRecordingSession({
			capture: {
				async start() {
					running = true;
				},
				running: () => running,
				async stop() {
					running = false;
					result = { blob: bytes, mimeType: bytes.type, sampleRate: 48000 };
				},
				async pause() {
					running = false;
				},
				async resume() {
					running = true;
				},
				reset() {
					running = false;
					result = null;
				},
				take: () => result,
				captureError: () => null,
			},
			upload: {
				async send() {
					await Promise.resolve();
				},
			},
		});
		next.subscribe((value) => {
			phase = value;
		});
		return next;
	}

	async function run(command: "start" | "pause" | "resume" | "stop"): Promise<void> {
		if (!session) return;
		try {
			await session[command]();
			note = phase;
		} catch (error) {
			note = error instanceof Error ? `${error.name}: ${error.message}` : "command failed";
		}
	}

	function cancel(): void {
		if (!session) return;
		try {
			session.cancel();
			note = phase;
		} catch (error) {
			note = error instanceof Error ? `${error.name}: ${error.message}` : "command failed";
		}
	}

	function reset(): void {
		session?.reset();
		note = phase;
	}
</script>

<svelte:head>
	<title>recording session</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-recording-session">
	<h1>recording session</h1>
	<p>
		<code>createRecordingSession</code> drives one take: idle, recording, paused, uploading, then done.
		Cancel and failure are terminal too. Reset is the way back to idle. The controller has no view and names no backend.
	</p>
	<p>
		Wire it to <code>AudioRecorder</code> with <code>captureFromRecorder</code>, and hand the finished blob to
		<code>uploadBlob</code> or any other <code>send(result, signal)</code>. The session does not import either helper.
		Call start from a user gesture. The recorder is what opens the microphone.
	</p>
	<p>
		<code>AudioRecorder</code> cannot pause. Its table tracks a grant, not a hold, and it has no upload phase.
		<code>captureFromRecorder</code> omits pause and resume, so <code>session.pause()</code> throws
		<code>pause_unsupported</code> and the take keeps recording. A port that can hold a take implements both methods.
		Stopping the recorder is not a pause. That ends the take.
	</p>
	<p>
		The phase stays idle while the grant is in flight. A second start throws busy. Cancel in that window ends cancelled,
		which the public table does not list, because recording has not been entered yet. A PCM take with
		<code>retain: false</code> stops with no blob and fails <code>empty_take</code> before upload. Stream those blocks
		from the recorder instead of asking the session to invent a file.
	</p>
	<pre data-testid="example"><code>{example}</code></pre>
	<p data-testid="phase">{phase}</p>
	<p data-testid="note">{note}</p>
	<button type="button" data-testid="start" disabled={!hydrated} onclick={() => run("start")}>Start</button>
	<button type="button" data-testid="pause" disabled={!hydrated} onclick={() => run("pause")}>Pause</button>
	<button type="button" data-testid="resume" disabled={!hydrated} onclick={() => run("resume")}>Resume</button>
	<button type="button" data-testid="stop" disabled={!hydrated} onclick={() => run("stop")}>Stop</button>
	<button type="button" data-testid="cancel" disabled={!hydrated} onclick={cancel}>Cancel</button>
	<button type="button" data-testid="reset" disabled={!hydrated} onclick={reset}>Reset</button>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
