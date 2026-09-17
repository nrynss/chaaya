import { afterEach, expect, test, vi } from "vitest"
import { AudioRecorder } from "./recorder.svelte.js"

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
