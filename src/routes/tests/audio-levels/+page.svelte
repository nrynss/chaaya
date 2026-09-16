<script lang="ts">
	import { onMount } from "svelte"
	import { generateSamples } from "../../../../tests/playwright/support/audio/input"
	import { LiveLevel } from "$lib/audio/levels/live-level.svelte"
	import { computePeaksInWorker } from "$lib/audio/levels/peaks-client"

	type Phase = "idle" | "running" | "done" | "failed"

	let hydrated = $state(false)
	let phase = $state<Phase>("idle")
	let silenceRms = $state("")
	let silencePeak = $state("")
	let toneRms = $state("")
	let tonePeak = $state("")
	let peaksMs = $state("")
	let maxGap = $state("")
	let peakMin = $state("")
	let peakMax = $state("")
	let loopState = $state("idle")
	let failure = $state("")

	onMount(() => {
		hydrated = true
	})

	const TONE_SECONDS = 20 * 60
	const SAMPLE_RATE = 48000
	const BUCKETS = TONE_SECONDS * 20
	/** A full scale sine, so the peak meter reads zero dBFS. The generator
	 * drives its markers through the same level, so a zero marker level leaves
	 * the plain tone. */
	const TONE = {
		sampleRate: SAMPLE_RATE,
		totalSeconds: 1,
		toneHz: 440,
		toneAmplitude: 1,
		markerAmplitude: 0
	}

	const format = (value: number) => value.toFixed(3)

	/** Let the page rest so the audio graph fills its analyser buffer. */
	function wait(ms: number): Promise<void> {
		const { promise, resolve } = Promise.withResolvers<void>()
		setTimeout(resolve, ms)
		return promise
	}

	/** The shared generated signal as a looped source. The meter reads it in
	 * place of a device, so the check needs no microphone in any engine. */
	function buildTone(context: AudioContext): AudioBufferSourceNode {
		const samples = generateSamples(TONE)
		const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE)
		buffer.getChannelData(0).set(samples)
		const source = context.createBufferSource()
		source.buffer = buffer
		source.loop = true
		return source
	}

	/** A long quiet signal with a known high and low, used for the peaks. */
	function synthesize(durationSeconds: number, rate: number): Float32Array {
		const frames = Math.floor(durationSeconds * rate)
		const samples = new Float32Array(frames)
		for (let index = 0; index < frames; index += 1) {
			samples[index] = index % 8000 < 4000 ? 0.5 : -0.9
		}
		return samples
	}

	/** Watch the gap between animation frames. The stop waits for one more
	 * frame, so a gap that spans a long block is recorded before the worst
	 * value is read. The gap is read from the clock at callback time, because
	 * a frame timestamp can carry the time before the block. A blocked main
	 * thread shows up as a long gap. */
	function frameGaps(): () => Promise<number> {
		let last = performance.now()
		let worst = 0
		let frame = requestAnimationFrame(function tick() {
			const now = performance.now()
			const gap = now - last
			if (gap > worst) worst = gap
			last = now
			frame = requestAnimationFrame(tick)
		})
		return async () => {
			const { promise, resolve } = Promise.withResolvers<void>()
			requestAnimationFrame(() => resolve())
			await promise
			cancelAnimationFrame(frame)
			return worst
		}
	}

	async function run(): Promise<void> {
		phase = "running"
		failure = ""
		try {
			const context = new AudioContext()
			await context.resume()
			const analyser = context.createAnalyser()
			analyser.fftSize = 2048
			/* The pull is a consumer on a stream sink, the shape the capture
			 * recorder and the generated-input helper define. A
			 * MediaRecorder over a MediaStreamAudioDestinationNode pulls the
			 * graph on every engine the coverage table lists, because the
			 * recorder reads the stream and the browser must render into it.
			 * A muted gain into the destination read the quiet floor on the
			 * runner, and a stream sink with no consumer pulled nothing on
			 * chromium there, so the sink stays wired but never goes without
			 * its reader. */
			const sink = context.createMediaStreamDestination()
			analyser.connect(sink)
			const recorder = new MediaRecorder(sink.stream)
			recorder.start(1000)
			const live = new LiveLevel(analyser)

			const silence = live.read()
			silenceRms = format(silence.rmsDb)
			silencePeak = format(silence.peakDb)

			const stopLoop = live.watch()
			const started = live.running ? "running" : "idle"
			stopLoop()
			loopState = `${started}->${live.running ? "running" : "idle"}`

			const source = buildTone(context)
			source.connect(analyser)
			source.start()
			/* A slow renderer can hand back a window that still holds a start up
			 * underrun, so the meter is read until it reports a live signal. The
			 * strongest window wins, because a gap only lowers a reading. */
			let tone = live.read()
			for (let attempt = 0; attempt < 12; attempt += 1) {
				await wait(50)
				const next = live.read()
				if (next.rmsDb > tone.rmsDb) tone = next
				if (tone.rmsDb > -6) break
			}
			source.stop()
			source.disconnect()
			toneRms = format(tone.rmsDb)
			tonePeak = format(tone.peakDb)
			recorder.stop()

			/* Build the buffer before arming the meter, so the fixture cost stays
			 * out of the reading and the gap tracks the compute alone. */
			const samples = synthesize(TONE_SECONDS, SAMPLE_RATE)
			const stopGaps = frameGaps()
			const computed = performance.now()
			const peaks = await computePeaksInWorker([samples], BUCKETS)
			peaksMs = format(performance.now() - computed)
			maxGap = format(await stopGaps())
			peakMin = format(peaks.min.reduce((low, value) => Math.min(low, value), Infinity))
			peakMax = format(peaks.max.reduce((high, value) => Math.max(high, value), -Infinity))
			phase = "done"
		} catch (error) {
			failure = String(error)
			phase = "failed"
		}
	}
</script>

<main>
	<h1>Audio levels</h1>
	<button type="button" data-testid="run" disabled={!hydrated} onclick={run}>Measure</button>
	<p data-testid="phase">{phase}</p>
	<p data-testid="failure">{failure}</p>
	<p data-testid="silence-rms">{silenceRms}</p>
	<p data-testid="silence-peak">{silencePeak}</p>
	<p data-testid="tone-rms">{toneRms}</p>
	<p data-testid="tone-peak">{tonePeak}</p>
	<p data-testid="peaks-ms">{peaksMs}</p>
	<p data-testid="max-frame-gap">{maxGap}</p>
	<p data-testid="peak-min">{peakMin}</p>
	<p data-testid="peak-max">{peakMax}</p>
	<p data-testid="loop-state">{loopState}</p>
</main>
