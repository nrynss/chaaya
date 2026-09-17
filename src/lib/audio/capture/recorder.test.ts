import { afterEach, expect, test, vi } from "vitest"
import { resampleChunks } from "./resample.js"
import { AudioRecorder } from "./recorder.svelte.js"
import type { CaptureChunk } from "./types.js"
import { encodeWav } from "./wav.js"

/** Counts how often a fake context closed. */
interface CloseCount {
	calls: number
}

/** What one grant answers with, a stream or a failure. */
type GrantOutcome = { stream: MediaStream } | { failure: unknown }

const scope = globalThis as unknown as Record<string, unknown>
const originalAudioContext = scope.AudioContext
const originalWorkletNode = scope.AudioWorkletNode

afterEach(() => {
	scope.AudioContext = originalAudioContext
	scope.AudioWorkletNode = originalWorkletNode
	vi.unstubAllGlobals()
})

/** A track that stays live, so a take keeps running while a check drives it. */
function fakeTrack(sampleRate: number): MediaStreamTrack {
	const track = {
		readyState: "live",
		addEventListener: () => undefined,
		stop: () => undefined,
		getSettings: () => ({ sampleRate })
	}
	return track as unknown as MediaStreamTrack
}

/** A stream of one live track at the given rate. */
function fakeStream(sampleRate: number): MediaStream {
	const track = fakeTrack(sampleRate)
	const stream = {
		getAudioTracks: () => [track],
		getTracks: () => [track]
	}
	return stream as unknown as MediaStream
}

/** A context that records its closes and renders no audio. */
function fakeContext(sampleRate: number, count: CloseCount): AudioContext {
	const source = { connect: () => undefined, disconnect: () => undefined }
	const mute = {
		gain: { value: 1 },
		connect: () => undefined,
		disconnect: () => undefined
	}
	const context = {
		sampleRate,
		destination: {},
		audioWorklet: { addModule: async () => undefined },
		createMediaStreamSource: () => source,
		createGain: () => mute,
		resume: async () => undefined,
		close: async () => {
			count.calls += 1
		}
	}
	return context as unknown as AudioContext
}

/** A worklet node that answers stop with one final empty block. */
class FakeWorkletNode {
	port: {
		onmessage: ((event: { data: unknown }) => void) | null
		postMessage: (message: unknown) => void
	}

	connect = () => undefined
	disconnect = () => undefined

	constructor() {
		const port: FakeWorkletNode["port"] = {
			onmessage: null,
			postMessage: (message: unknown) => {
				if (message !== "stop") return
				port.onmessage?.({
					data: { samples: new Float32Array(0), offset: 0, contextTime: 0, final: true }
				})
			}
		}
		this.port = port
	}
}

/** Answers every grant with the outcome and installs the fake worklet node. */
function installGrant(outcome: GrantOutcome): void {
	vi.stubGlobal("navigator", {
		mediaDevices: {
			getUserMedia: async () => {
				if ("failure" in outcome) throw outcome.failure
				return outcome.stream
			}
		}
	})
	vi.stubGlobal("URL", {
		createObjectURL: () => "blob:fake",
		revokeObjectURL: () => undefined
	})
	scope.AudioWorkletNode = FakeWorkletNode as unknown as typeof AudioWorkletNode
}

/** Installs a context class that counts its closes, for the self-made path. */
function installContextClass(sampleRate: number, count: CloseCount): void {
	const source = { connect: () => undefined, disconnect: () => undefined }
	const mute = {
		gain: { value: 1 },
		connect: () => undefined,
		disconnect: () => undefined
	}
	class MadeContext {
		readonly sampleRate = sampleRate
		destination = {}
		audioWorklet = { addModule: async () => undefined }
		createMediaStreamSource = () => source
		createGain = () => mute
		resume = async () => undefined
		close = async () => {
			count.calls += 1
		}
	}
	scope.AudioContext = MadeContext as unknown as typeof AudioContext
}

test("a supplied context records and stays open through stop", async () => {
	const count: CloseCount = { calls: 0 }
	installGrant({ stream: fakeStream(48000) })
	const context = fakeContext(44100, count)
	const recorder = new AudioRecorder({ mode: "pcm", context, autoStopSeconds: 0 })
	await recorder.start()
	expect(recorder.state).toBe("recording")
	expect(recorder.renderRate).toBe(44100)
	await recorder.stop()
	expect(recorder.state).toBe("stopped")
	expect(recorder.result).not.toBeNull()
	expect(count.calls).toBe(0)
})

test("a supplied context stays open through reset", async () => {
	const count: CloseCount = { calls: 0 }
	installGrant({ stream: fakeStream(48000) })
	const context = fakeContext(48000, count)
	const recorder = new AudioRecorder({ mode: "pcm", context, autoStopSeconds: 0 })
	await recorder.start()
	expect(recorder.state).toBe("recording")
	recorder.reset()
	expect(recorder.state).toBe("idle")
	expect(count.calls).toBe(0)
})

test("a supplied context stays open when the grant fails", async () => {
	const count: CloseCount = { calls: 0 }
	installGrant({ failure: new Error("The device is gone.") })
	const context = fakeContext(48000, count)
	const recorder = new AudioRecorder({ mode: "pcm", context, autoStopSeconds: 0 })
	await recorder.start()
	expect(recorder.state).toBe("failed")
	expect(count.calls).toBe(0)
})

test("a self-made context closes exactly once on stop", async () => {
	const count: CloseCount = { calls: 0 }
	installGrant({ stream: fakeStream(48000) })
	installContextClass(48000, count)
	const recorder = new AudioRecorder({ mode: "pcm", autoStopSeconds: 0 })
	await recorder.start()
	expect(recorder.state).toBe("recording")
	await recorder.stop()
	expect(recorder.state).toBe("stopped")
	expect(count.calls).toBe(1)
})

test("a self-made context closes exactly once on reset", async () => {
	const count: CloseCount = { calls: 0 }
	installGrant({ stream: fakeStream(48000) })
	installContextClass(48000, count)
	const recorder = new AudioRecorder({ mode: "pcm", autoStopSeconds: 0 })
	await recorder.start()
	expect(recorder.state).toBe("recording")
	recorder.reset()
	expect(recorder.state).toBe("idle")
	expect(count.calls).toBe(1)
})

test("renderRate names the rate blocks arrive at and offers no setter", async () => {
	installGrant({ stream: fakeStream(48000) })
	const context = fakeContext(44100, { calls: 0 })
	const recorder = new AudioRecorder({ mode: "pcm", context, autoStopSeconds: 0 })
	await recorder.start()
	expect(recorder.renderRate).toBe(44100)
	const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(recorder), "renderRate")
	expect(descriptor?.get).toBeTypeOf("function")
	expect(descriptor?.set).toBeUndefined()
	recorder.reset()
})

/** The frames one synthetic block carries. */
const BLOCK_FRAMES = 128

/** How many blocks one synthetic take carries. */
const BLOCK_TOTAL = 24

/** A worklet node that answers stop after posting a scripted take. */
class ScriptedWorkletNode {
	port: {
		onmessage: ((event: { data: unknown }) => void) | null
		postMessage: (message: unknown) => void
	}

	connect = () => undefined
	disconnect = () => undefined

	constructor(
		readonly frames: number,
		readonly total: number
	) {
		const port: ScriptedWorkletNode["port"] = {
			onmessage: null,
			postMessage: (message: unknown) => {
				if (message !== "stop") return
				let offset = 0
				for (let block = 0; block < this.total; block += 1) {
					const samples = new Float32Array(this.frames).fill(0.25)
					port.onmessage?.({
						data: { samples, offset, contextTime: offset / 48000, final: false }
					})
					offset += this.frames
				}
				port.onmessage?.({
					data: { samples: new Float32Array(0), offset, contextTime: offset / 48000, final: true }
				})
			}
		}
		this.port = port
	}
}

/** Installs the scripted worklet node beside the grant stub. */
function installScriptedWorklet(frames: number, total: number): void {
	class Scripted extends ScriptedWorkletNode {
		constructor() {
			super(frames, total)
		}
	}
	scope.AudioWorkletNode = Scripted as unknown as typeof AudioWorkletNode
}

test("a streaming take retains no blocks and reports every block once in order", async () => {
	installGrant({ stream: fakeStream(48000) })
	installScriptedWorklet(BLOCK_FRAMES, BLOCK_TOTAL)
	const context = fakeContext(48000, { calls: 0 })
	const seen: CaptureChunk[] = []
	const recorder = new AudioRecorder({
		mode: "pcm",
		context,
		autoStopSeconds: 0,
		retain: false,
		onChunk: (chunk) => {
			seen.push(chunk)
		}
	})
	await recorder.start()
	expect(recorder.state).toBe("recording")
	await recorder.stop()
	expect(recorder.state).toBe("stopped")
	expect(seen).toHaveLength(BLOCK_TOTAL)
	expect(recorder.chunks).toHaveLength(0)
	expect(recorder.chunkCount).toBe(BLOCK_TOTAL)
	expect(recorder.result).toBeNull()
	for (let index = 0; index < seen.length; index += 1) {
		expect(seen[index].offset).toBe(index * BLOCK_FRAMES)
		if (index > 0) {
			expect(seen[index].offset).toBe(seen[index - 1].offset + seen[index - 1].samples.length)
			expect(seen[index].contextTime).toBeGreaterThanOrEqual(seen[index - 1].contextTime)
		}
	}
	recorder.reset()
})

test("a retained take stays byte identical to the take without a listener", async () => {
	const heard: CaptureChunk[] = []
	installGrant({ stream: fakeStream(48000) })
	installScriptedWorklet(BLOCK_FRAMES, BLOCK_TOTAL)
	const firstContext = fakeContext(48000, { calls: 0 })
	const first = new AudioRecorder({
		mode: "pcm",
		context: firstContext,
		autoStopSeconds: 0,
		onChunk: (chunk) => {
			heard.push(chunk)
		}
	})
	await first.start()
	await first.stop()
	const firstBytes = new Uint8Array(await first.result!.blob.arrayBuffer())
	const firstSamples = first.chunks.map((chunk) => chunk.samples.length)

	installGrant({ stream: fakeStream(48000) })
	installScriptedWorklet(BLOCK_FRAMES, BLOCK_TOTAL)
	const secondContext = fakeContext(48000, { calls: 0 })
	const second = new AudioRecorder({ mode: "pcm", context: secondContext, autoStopSeconds: 0 })
	await second.start()
	await second.stop()
	const secondBytes = new Uint8Array(await second.result!.blob.arrayBuffer())

	expect(first.result).not.toBeNull()
	expect(heard).toHaveLength(BLOCK_TOTAL)
	expect(firstSamples).toEqual(second.chunks.map((chunk) => chunk.samples.length))
	expect(firstBytes).toEqual(secondBytes)
	const rebuilt = await encodeWav(
		resampleChunks(heard, first.renderRate, first.result!.sampleRate),
		first.result!.sampleRate
	).arrayBuffer()
	expect(new Uint8Array(rebuilt)).toEqual(firstBytes)
	first.reset()
	second.reset()
})

test("keeping a block under retain false fails the memory pin by design", async () => {
	installGrant({ stream: fakeStream(48000) })
	installScriptedWorklet(BLOCK_FRAMES, BLOCK_TOTAL)
	const context = fakeContext(48000, { calls: 0 })
	const held: CaptureChunk[] = []
	const recorder = new AudioRecorder({
		mode: "pcm",
		context,
		autoStopSeconds: 0,
		retain: false,
		onChunk: (chunk) => {
			held.push(chunk)
		}
	})
	await recorder.start()
	await recorder.stop()
	// The recorder dropped every block, so only the listener's own copies
	// remain. A listener that holds no copy holds nothing at all.
	expect(recorder.chunks).toHaveLength(0)
	expect(held).toHaveLength(BLOCK_TOTAL)
	recorder.reset()
})
