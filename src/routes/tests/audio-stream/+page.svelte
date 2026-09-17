<script lang="ts">
	import { onMount } from "svelte"
	import { PcmStreamPlayer } from "$lib/audio/playback/stream.svelte.js"

	/** The generated signal this page plays. A tone with a loud burst
	 * marking every slot, so a reader finds each marker by its level. */
	const SIGNAL = {
		sampleRate: 48000,
		blockSeconds: 0.1,
		toneHz: 220,
		markerHz: 2000,
		toneAmplitude: 0.25,
		markerAmplitude: 0.9,
		markerMs: 25
	}

	type StreamState = {
		readonly blockStarts: number[]
		readonly blockEnds: number[]
		readonly underruns: number
		readonly cutTime: number | null
	}

	let player = $state<PcmStreamPlayer | null>(null)
	let context = $state<AudioContext | null>(null)
	let destination = $state<MediaStreamAudioDestinationNode | null>(null)
	let hydrated = $state(false)

	onMount(() => {
		hydrated = true
	})

	/** One block of the signal, with the marker burst inside its slot. */
	function block(slot: number): Float32Array {
		const frames = Math.round(SIGNAL.blockSeconds * SIGNAL.sampleRate)
		const samples = new Float32Array(frames)
		for (let index = 0; index < frames; index += 1) {
			const time = slot * SIGNAL.blockSeconds + index / SIGNAL.sampleRate
			let value = SIGNAL.toneAmplitude * Math.sin(2 * Math.PI * SIGNAL.toneHz * time)
			const inSlot = index / SIGNAL.sampleRate
			if (slot !== 0 && inSlot < SIGNAL.markerMs / 1000) {
				value += SIGNAL.markerAmplitude * Math.sin(2 * Math.PI * SIGNAL.markerHz * time)
			}
			samples[index] = value
		}
		return samples
	}

	/** Open the playback context inside the gesture and start recording its
	 * output. The player schedules on this context, so it shares the clock
	 * the capture already runs on. */
	async function open(): Promise<void> {
		context?.close().catch(() => undefined)
		player = null
		destination = null
		const next = new AudioContext({ sampleRate: SIGNAL.sampleRate })
		await next.resume()
		const tap = next.createMediaStreamDestination()
		const gain = next.createGain()
		gain.gain.value = 1
		gain.connect(next.destination)
		gain.connect(tap)
		destination = tap
		context = next
		player = new PcmStreamPlayer({ context: next, destination: gain })
	}

	async function playTwo(): Promise<void> {
		if (!context || !player) await open()
		player?.push(block(1))
		player?.push(block(2))
	}

	async function playThenFlush(): Promise<void> {
		if (!context || !player) await open()
		for (let slot = 1; slot <= 6; slot += 1) player?.push(block(slot))
		const { promise, resolve } = Promise.withResolvers<void>()
		setTimeout(resolve, 350)
		await promise
		player?.flush()
	}

	function snapshot(): StreamState {
		const active = player
		return {
			blockStarts: active ? active.blocks.map((entry) => entry.startTime) : [],
			blockEnds: active ? active.blocks.map((entry) => entry.endTime) : [],
			underruns: active?.underruns ?? 0,
			cutTime: active?.lastCut ?? null
		}
	}

	$effect(() => {
		const scope = window as unknown as {
			__stream?: () => StreamState
			__tap?: () => MediaStream | null
			__now?: () => number
		}
		scope.__stream = snapshot
		scope.__tap = () => destination?.stream ?? null
		scope.__now = () => context?.currentTime ?? 0
	})
</script>

<main>
	<h1>Audio stream harness</h1>
	<button type="button" data-testid="open" disabled={!hydrated} onclick={open}>Open</button>
	<button type="button" data-testid="play-two" disabled={!hydrated} onclick={playTwo}>
		Play two blocks
	</button>
	<button type="button" data-testid="play-flush" disabled={!hydrated} onclick={playThenFlush}>
		Play then flush
	</button>
	<p data-testid="blocks">{player?.blocks.length ?? 0}</p>
	<p data-testid="underruns">{player?.underruns ?? 0}</p>
	<p data-testid="cut">{player?.lastCut ?? ""}</p>
	<p data-testid="elapsed">{context?.currentTime ?? 0}</p>
	<p data-testid="rate">{context?.sampleRate ?? 0}</p>
</main>
