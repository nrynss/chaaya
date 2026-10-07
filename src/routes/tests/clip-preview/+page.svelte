<script lang="ts">
	import { onMount } from "svelte"
	import { ClipScheduler } from "$lib/audio/playback/scheduler.svelte"

	/* The marker clip starts one second into the video, and its beep starts
	 * half a second into the clip. The beep lands at 1.5 video seconds, and
	 * the check reads that onset from the captured samples. */
	const CLIP_OFFSET = 1
	const BEEP_IN_CLIP = 0.5
	/** The video second the capture stops at. */
	const STOP_AT = 4
	/** The sample level that names the beep onset. */
	const ONSET_LEVEL = 0.05

	let video: HTMLVideoElement | undefined
	let scheduler = $state<ClipScheduler | null>(null)
	let context = $state<AudioContext | null>(null)
	let hydrated = $state(false)
	let status = $state("idle")
	let skippedReason = $state("")
	let beepSample = $state(-1)
	let beepRate = $state(0)
	let recordedSamples = $state(0)

	const expectedBeep = $derived(
		beepRate > 0 ? Math.round((CLIP_OFFSET + BEEP_IN_CLIP) * beepRate) : 0
	)

	onMount(() => {
		hydrated = true
	})

	/** Run the preview inside the gesture and capture its mix. The
	 * scheduler follows the video clock. A processor node keeps every
	 * sample it sounds. The check reads the beep onset by sample count
	 * with no encoding or decoding between. */
	async function run(): Promise<void> {
		if (!video) return
		status = "running"
		beepSample = -1
		const next = new AudioContext()
		await next.resume()
		context = next
		const tap = next.createScriptProcessor(4096, 1, 1)
		const captured: Float32Array[] = []
		tap.onaudioprocess = (event: AudioProcessingEvent): void => {
			captured.push(new Float32Array(event.inputBuffer.getChannelData(0)))
		}
		const preview = new ClipScheduler({
			context: next,
			element: video,
			destination: tap,
			onSkipped: (_key, reason) => {
				skippedReason = reason
			}
		})
		preview.setClips([
			{
				key: "marker",
				url: "/tests/clip-preview/media/marker.wav",
				offset: CLIP_OFFSET,
				inPoint: 0,
				length: 2,
				gain: 1
			},
			{
				key: "missing",
				url: "/tests/clip-preview/media/missing.wav",
				offset: 0.5,
				inPoint: 0,
				length: 1,
				gain: 1
			}
		])
		preview.attach()
		scheduler = preview
		/* Warm the decode cache before the tap runs, so the first sync
		 * starts at once and the beep lands on its offset sample. */
		await preview.prepare()
		tap.connect(next.destination)
		const element = video
		/* The markup carries no source, so the run hands the clip to the
		 * element it owns, the way the video harness already does. */
		element.src = "/tests/clip-preview/media/clip.webm"
		element.currentTime = 0
		const stopped = new Promise<void>((resolve) => {
			const onTime = (): void => {
				if (element.currentTime >= STOP_AT) {
					element.removeEventListener("timeupdate", onTime)
					resolve()
				}
			}
			element.addEventListener("timeupdate", onTime)
		})
		await element.play()
		await stopped
		element.pause()
		preview.detach()
		tap.disconnect()
		const total = captured.reduce((sum, block) => sum + block.length, 0)
		const channel = new Float32Array(total)
		let at = 0
		for (const block of captured) {
			channel.set(block, at)
			at += block.length
		}
		beepRate = next.sampleRate
		recordedSamples = channel.length
		let onset = -1
		for (let index = 0; index < channel.length; index += 1) {
			if (Math.abs(channel[index]) > ONSET_LEVEL) {
				onset = index
				break
			}
		}
		beepSample = onset
		status = "done"
	}

	/** Move the playhead past every clip. The scheduler stops its sources
	 * and plans nothing there. */
	function seekPast(): void {
		if (!video) return
		video.currentTime = 6
	}

	function stopAll(): void {
		scheduler?.stopAll()
		context?.close().catch(() => undefined)
	}
</script>

<main data-testid="harness-clip-preview">
	<h1>Clip preview harness</h1>
	<video
		data-testid="video"
		bind:this={video}
		playsinline
		preload="metadata"
		width="320"
		height="240"
	></video>
	<button type="button" data-testid="run" disabled={!hydrated} onclick={run}>Run</button>
	<button type="button" data-testid="seek-past" disabled={!hydrated} onclick={seekPast}>
		Seek past
	</button>
	<button type="button" data-testid="close" disabled={!hydrated} onclick={stopAll}>Close</button>
	<dl>
		<dt>Status</dt>
		<dd data-testid="status">{status}</dd>
		<dt>Live sources</dt>
		<dd data-testid="live">{scheduler ? scheduler.liveCount : ""}</dd>
		<dt>Skipped</dt>
		<dd data-testid="skipped">{scheduler ? scheduler.skipped.join(",") : ""}</dd>
		<dt>Skipped reason</dt>
		<dd data-testid="skipped-reason">{skippedReason}</dd>
		<dt>Beep sample</dt>
		<dd data-testid="beep-sample">{beepSample}</dd>
		<dt>Expected beep sample</dt>
		<dd data-testid="beep-expected">{expectedBeep}</dd>
		<dt>Sample rate</dt>
		<dd data-testid="sample-rate">{beepRate}</dd>
		<dt>Recorded samples</dt>
		<dd data-testid="recorded-samples">{recordedSamples}</dd>
	</dl>
</main>
