<script lang="ts">
	import { resolve } from "$app/paths"
	import referenceCss from "$lib/tokens/reference.css?raw"
	import { onMount } from "svelte"
	import { ClipScheduler } from "$lib/audio/playback/scheduler.svelte.js"
	import { a11yGate, contrastGate } from "$lib/testing/index.js"

	let video: HTMLVideoElement | undefined
	let scheduler = $state<ClipScheduler | null>(null)
	let context = $state<AudioContext | null>(null)
	let hydrated = $state(false)
	let checks = $state("")
	let checkFailure = $state("")

	const pairs = [
		["text", "surface"],
		["dim", "surface"]
	] as const

	onMount(() => {
		hydrated = true
	})

	/** Open the preview context inside the gesture and attach the
	 * scheduler to the caller owned video. The scheduler never closes the
	 * context, so the page keeps its clock. */
	async function open(): Promise<void> {
		if (!video) return
		context?.close().catch(() => undefined)
		const next = new AudioContext()
		await next.resume()
		context = next
		/* The markup carries no source, so the page hands the clip to the
		 * element it owns, the way the video pages already do. */
		video.src = "/tests/clip-preview/media/clip.webm"
		const preview = new ClipScheduler({ context: next, element: video })
		preview.setClips([
			{
				key: "marker",
				url: "/tests/clip-preview/media/marker.wav",
				offset: 1,
				inPoint: 0,
				length: 2,
				gain: 0.8
			}
		])
		preview.attach()
		scheduler = preview
	}

	function close(): void {
		scheduler?.detach()
		scheduler?.stopAll()
		scheduler = null
		context?.close().catch(() => undefined)
		context = null
	}

	/** Run the gate pair on this page. The pairs name every colour pair the
	 * markup draws, so the gate measures each one. */
	async function runChecks(): Promise<void> {
		checks = ""
		checkFailure = ""
		try {
			const container = document.querySelector<HTMLElement>("[data-testid='docs-clip-preview']")
			if (!container) throw new Error("the markup is missing")
			await a11yGate(container)
			contrastGate(referenceCss, pairs)
			checks = "pass"
		} catch (error) {
			checkFailure = error instanceof Error ? error.message.split("\n")[0] : String(error)
		}
	}
</script>

<svelte:head>
	<title>clip preview</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-clip-preview">
	<h1>clip preview</h1>
	<p>A mix preview schedules timed clips against a video clock through Web Audio. Each clip carries a key, a URL, an offset, an in point, a length, and a gain. Clips decode once per key into a bounded cache. Play and seek stop every source. They plan the clips at the playhead. An overlapping clip starts at the right in point, and a later clip waits for its offset. A timeupdate past the drift tolerance reschedules the same way. No wall clock timer runs.</p>
	<p>A clip that fails to load reports through a callback and lands in the skipped set, and nothing replaces it. This preview is an approximation. The server mix measures the release.</p>
	<video
		data-testid="video"
		bind:this={video}
		playsinline
		preload="metadata"
		width="320"
		height="240"
	></video>
	<button type="button" data-testid="open" disabled={!hydrated} onclick={open}>Open</button>
	<button type="button" data-testid="play" disabled={!hydrated} onclick={() => void video?.play()}>
		Play
	</button>
	<button type="button" data-testid="pause" disabled={!hydrated} onclick={() => video?.pause()}>
		Pause
	</button>
	<button type="button" data-testid="close" disabled={!hydrated} onclick={close}>Close</button>
	<button type="button" data-testid="run-checks" disabled={!hydrated} onclick={runChecks}>
		Run checks
	</button>
	<p data-testid="checks">{checks}</p>
	<p data-testid="check-failure">{checkFailure}</p>
	<dl>
		<dt>Live sources</dt>
		<dd data-testid="live">{scheduler ? scheduler.liveCount : 0}</dd>
		<dt>Skipped</dt>
		<dd data-testid="skipped">{scheduler ? scheduler.skipped.join(",") : ""}</dd>
	</dl>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
