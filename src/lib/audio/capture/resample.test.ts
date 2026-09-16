import { expect, test } from "vitest"
import { resampleChunks, resampleLinear } from "./resample"

test("equal rates hand the same samples straight back", () => {
	const samples = Float32Array.from([0.1, 0.2, 0.3])
	expect(resampleLinear(samples, 48000, 48000)).toBe(samples)
})

test("a doubled rate doubles the frame count and fills between frames", () => {
	expect(Array.from(resampleLinear(Float32Array.from([0, 1]), 2, 4))).toEqual([0, 0.5, 1, 1])
})

test("a halved rate halves the frame count", () => {
	expect(Array.from(resampleLinear(Float32Array.from([0, 1, 2, 3]), 4, 2))).toEqual([0, 2])
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
