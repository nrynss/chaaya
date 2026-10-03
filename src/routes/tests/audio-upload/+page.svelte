<script lang="ts">
	import { page } from "$app/state"
	import { ChunkUploader } from "$lib/adapters/keel/upload"
	import { onMount } from "svelte"
	import { installGeneratedMicrophone } from "../../../../tests/playwright/support/audio/input"

	/** The collection path the upload opens on. A spec passes one in. */
	const base = page.url.searchParams.get("upload") ?? ""

	/** The owner every harness upload belongs to. */
	const owner = "harness-owner"

	/** The longest chunk the uploader sends. A small chunk keeps the streaming
	 * and the resume visible inside one short take. */
	const chunkSize = 4096

	/** The span one recorded block covers, in milliseconds. */
	const blockMs = 200

	/** The length of the generated signal in seconds. */
	const signalSeconds = 1.5

	/** How long the harness records, in seconds. The tail past the signal is
	 * silence, so a late start never clips a marker. */
	const recordSeconds = 4

	/** The containers a take may record into, best first. */
	const takeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]

	/** What the page is doing, for a spec to wait on. */
	type Phase = "idle" | "recording" | "uploading" | "done" | "failed"

	let phase = $state<Phase>("idle")
	let uploader = $state<ChunkUploader | null>(null)
	let resumed = $state(false)
	let failure = $state("")
	let recordedBytes = $state(0)
	let blockCount = $state(0)
	let hydrated = $state(false)

	/** The blocks the recorder handed over, so a spec reads the take this page
	 * produced beside the take the server assembled. */
	let blocks: Uint8Array<ArrayBuffer>[] = []
	/** The microphone patch this run installed, so a stop releases it. */
	let microphone: ReturnType<typeof installGeneratedMicrophone> | null = null
	let recorder: MediaRecorder | null = null
	let timer: ReturnType<typeof setTimeout> | null = null
	/** The chain that keeps every block's append in arrival order. */
	let chain: Promise<void> = Promise.resolve()

	/** Pick the container this browser records into. */
	function pickType(): string {
		for (const type of takeTypes) {
			if (MediaRecorder.isTypeSupported(type)) return type
		}
		throw new Error("This browser records no audio container.")
	}

	/** Join the recorded blocks into one buffer, in arrival order. */
	function joined(): Uint8Array<ArrayBuffer> {
		let size = 0
		for (const block of blocks) size += block.byteLength
		const all = new Uint8Array(size)
		let offset = 0
		for (const block of blocks) {
			all.set(block, offset)
			offset += block.byteLength
		}
		return all
	}

	/** Hand one base64 copy of the recorded take to the spec, so the spec reads
	 * the exact bytes the uploader received. */
	function exposeRecorded(): void {
		const all = joined()
		let binary = ""
		const step = 0x8000
		for (let index = 0; index < all.length; index += step) {
			binary += String.fromCharCode(...all.subarray(index, index + step))
		}
		;(window as Window & { __recorded?: string }).__recorded = btoa(binary)
	}

	/** End the take and complete the upload. */
	async function stop(): Promise<void> {
		if (timer !== null) clearTimeout(timer)
		timer = null
		const media = recorder
		recorder = null
		if (media !== null && media.state !== "inactive") {
			const { promise, resolve } = Promise.withResolvers<void>()
			media.onstop = () => resolve()
			media.stop()
			await promise
		}
		await chain
		exposeRecorded()
		microphone?.restore()
		const next = uploader
		if (next === null) return
		phase = "uploading"
		await next.finish()
		phase = next.state === "done" ? "done" : "failed"
		if (next.state !== "done") failure = next.error?.message ?? "the upload did not finish"
	}

	/** Record the generated signal, and stream it to the server as it arrives. */
	async function start(): Promise<void> {
		if (phase === "recording" || phase === "uploading") return
		failure = ""
		blocks = []
		blockCount = 0
		recordedBytes = 0
		resumed = false
		phase = "recording"
		try {
			microphone = installGeneratedMicrophone({ totalSeconds: signalSeconds })
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
			const type = pickType()
			const next = new ChunkUploader({ url: base, owner, contentType: type, chunkSize })
			uploader = next
			/* The recorder starts before the upload opens. The signal begins
			 * inside getUserMedia, so a recorder that waits for the open
			 * misses the first span of the take, and firefox's slower open
			 * clips the first marker away. The uploader holds the blocks that
			 * arrive while the open is in flight and streams them once it
			 * answers. */
			const media = new MediaRecorder(stream, { mimeType: type })
			recorder = media
			media.ondataavailable = (event) => {
				if (event.data.size === 0) return
				chain = chain.then(async () => {
					const bytes = new Uint8Array(await event.data.arrayBuffer())
					blocks.push(bytes)
					blockCount += 1
					recordedBytes += bytes.byteLength
					next.append(bytes)
				})
			}
			const opening = next.start()
			media.start(blockMs)
			await opening
			if (next.state !== "streaming") {
				throw new Error(next.error?.message ?? "the upload did not open")
			}
			phase = "uploading"
			timer = setTimeout(() => void stop(), recordSeconds * 1000)
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error)
			phase = "failed"
		}
	}

	/** Pick up the upload a reloaded page left behind, and complete it. The
	 * capture stream is gone, so this finishes what it recovered. */
	async function resume(): Promise<void> {
		if (base === "") return
		const next = await ChunkUploader.resume()
		if (next === undefined) return
		uploader = next
		resumed = true
		phase = "uploading"
		await next.finish()
		phase = next.state === "done" ? "done" : "failed"
		if (next.state !== "done") failure = next.error?.message ?? "the upload did not finish"
	}

	onMount(() => {
		hydrated = true
		void resume()
	})
</script>

<main>
	<h1>Chunked upload harness</h1>
	<dl>
		<dt>Phase</dt>
		<dd data-testid="phase">{phase}</dd>
		<dt>Resumed</dt>
		<dd data-testid="resumed">{resumed ? "yes" : "no"}</dd>
		<dt>State</dt>
		<dd data-testid="state">{uploader?.state ?? "none"}</dd>
		<dt>Id</dt>
		<dd data-testid="id">{uploader?.id ?? ""}</dd>
		<dt>Blocks</dt>
		<dd data-testid="blocks">{blockCount}</dd>
		<dt>Recorded</dt>
		<dd data-testid="recorded">{recordedBytes}</dd>
		<dt>Captured</dt>
		<dd data-testid="captured">{uploader?.capturedBytes ?? 0}</dd>
		<dt>Acknowledged</dt>
		<dd data-testid="acknowledged">{uploader?.acknowledged ?? 0}</dd>
		<dt>Pending</dt>
		<dd data-testid="pending">{uploader?.pending ?? 0}</dd>
		<dt>Retries</dt>
		<dd data-testid="retries">{uploader?.retries ?? 0}</dd>
		<dt>Stored</dt>
		<dd data-testid="stored">{uploader?.stored ?? 0}</dd>
		<dt>Receipt</dt>
		<dd data-testid="receipt">{uploader?.receipt?.sha256 ?? ""}</dd>
		<dt>Error</dt>
		<dd data-testid="error">{uploader?.error?.code ?? ""}</dd>
		<dt>Failure</dt>
		<dd data-testid="failure">{failure}</dd>
	</dl>
	<button type="button" data-testid="record" disabled={!hydrated || base === ""} onclick={start}>
		Record and upload
	</button>
</main>
