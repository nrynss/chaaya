<script lang="ts">
	import type { CaptureMode, CaptureResult } from "$lib/audio/capture"
	import { AudioRecorder } from "$lib/audio/capture"

	const SECONDS = 3

	let recorder = $state<AudioRecorder | null>(null)

	function start(mode: CaptureMode): void {
		const next = new AudioRecorder({ mode, autoStopSeconds: SECONDS })
		recorder = next
		void next.start()
	}

	async function stop(): Promise<void> {
		await recorder?.stop()
	}

	function clear(): void {
		recorder?.reset()
		recorder = null
	}

	$effect(() => {
		;(window as Window & { __capture?: CaptureResult }).__capture =
			recorder?.result ?? undefined
	})
</script>

<main>
	<h1>Audio capture harness</h1>
	<p data-testid="mode">{recorder?.mode ?? "none"}</p>
	<p data-testid="state">{recorder?.state ?? "idle"}</p>
	<p data-testid="chunks">{recorder?.chunkCount ?? 0}</p>
	<p data-testid="mime">{recorder?.result?.mimeType ?? ""}</p>
	<p data-testid="rate">{recorder?.result?.sampleRate ?? 0}</p>
	<p data-testid="size">{recorder?.result?.blob.size ?? 0}</p>
	<p data-testid="error">{recorder?.error ? String(recorder.error) : ""}</p>
	<button data-testid="start-compressed" onclick={() => start("compressed")}>
		Record compressed
	</button>
	<button data-testid="start-pcm" onclick={() => start("pcm")}>Record pcm</button>
	<button data-testid="stop" onclick={stop}>Stop</button>
	<button data-testid="reset" onclick={clear}>Reset</button>
</main>
