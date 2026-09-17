import { expect, test } from "vitest"
import { resampleChunks, resampleLinear } from "./resample"

test("equal rates hand the same samples straight back", () => {
	const samples = Float32Array.from([0.1, 0.2, 0.3])
	expect(resampleLinear(samples, 48000, 48000)).toBe(samples)
})

test("a doubled rate doubles the frame count and fills between frames", () => {
	expect(Array.from(resampleLinear(Float32Array.from([0, 1]), 2, 4))).toEqual([0, 0.5, 1, 1])
})

test("a halved rate filters, then keeps every other frame", () => {
	const converted = resampleLinear(Float32Array.from([0, 1, 2, 3]), 4, 2)
	expect(converted).toHaveLength(2)
	expect(converted[1]).toBeGreaterThan(converted[0])
})

test("a take with no frame stays empty", () => {
	expect(resampleLinear(new Float32Array(0), 44100, 48000)).toHaveLength(0)
})

test("resampled blocks keep their span and gain fresh offsets", () => {
	const chunks = [
		{ samples: Float32Array.from([0, 1]), offset: 0, contextTime: 0.5 },
		{ samples: Float32Array.from([2, 3]), offset: 2, contextTime: 1 }
	]
	const converted = resampleChunks(chunks, 2, 4)
	expect(converted.map((chunk) => chunk.samples.length)).toEqual([4, 4])
	expect(converted.map((chunk) => chunk.offset)).toEqual([0, 4])
	expect(converted.map((chunk) => chunk.contextTime)).toEqual([0.5, 1])
})

test("equal rates keep the very same block list", () => {
	const chunks = [{ samples: Float32Array.from([0, 1]), offset: 0, contextTime: 0 }]
	expect(resampleChunks(chunks, 48000, 48000)).toBe(chunks)
})

/** Reads the strength of one tone in frames at the given rate. */
function toneLevel(samples: Float32Array, frequency: number, rate: number): number {
	let real = 0
	let imaginary = 0
	for (let index = 0; index < samples.length; index += 1) {
		const phase = (2 * Math.PI * frequency * index) / rate
		real += samples[index] * Math.cos(phase)
		imaginary -= samples[index] * Math.sin(phase)
	}
	return Math.hypot(real, imaginary) / (samples.length / 2)
}

/** Builds a pure tone at the given rate. */
function makeTone(frequency: number, rate: number, frames: number): Float32Array {
	const samples = new Float32Array(frames)
	for (let index = 0; index < frames; index += 1) {
		samples[index] = Math.sin((2 * Math.PI * frequency * index) / rate)
	}
	return samples
}

test("a 15 kHz tone at 48 kHz leaves no voice-band image at 24 kHz", () => {
	const folded = resampleLinear(makeTone(15000, 48000, 4800), 48000, 24000)
	const reference = resampleLinear(makeTone(1000, 48000, 4800), 48000, 24000)
	const ratio = toneLevel(folded, 9000, 24000) / toneLevel(reference, 1000, 24000)
	expect(20 * Math.log10(ratio)).toBeLessThan(-40)
})

test("halved blocks stay contiguous with no gap and no overlap", () => {
	const chunks = [
		{ samples: makeTone(1000, 48000, 480), offset: 0, contextTime: 0 },
		{ samples: makeTone(1000, 48000, 480), offset: 480, contextTime: 0.01 }
	]
	const converted = resampleChunks(chunks, 48000, 24000)
	expect(converted.map((chunk) => chunk.samples.length)).toEqual([240, 240])
	expect(converted.map((chunk) => chunk.offset)).toEqual([0, 240])
	const joined = new Float32Array(480)
	joined.set(converted[0].samples, 0)
	joined.set(converted[1].samples, 240)
	const direct = resampleLinear(
		Float32Array.from([...chunks[0].samples, ...chunks[1].samples]),
		48000,
		24000
	)
	expect(joined.length).toEqual(direct.length)
})
