import { expect, test } from "vitest"
import { computePeaks } from "./peaks"

/** A sine at the given amplitude, one second long at 48 kHz. The frequency
 * divides the rate, so the block holds whole cycles and its values are exact. */
function sine(amplitude: number, hertz = 1000, sampleRate = 48000, seconds = 1): Float32Array {
	const frames = sampleRate * seconds
	const samples = new Float32Array(frames)
	for (let index = 0; index < frames; index += 1) {
		samples[index] = amplitude * Math.sin((2 * Math.PI * hertz * index) / sampleRate)
	}
	return samples
}

test("silence reads zero high and low", () => {
	const peaks = computePeaks([new Float32Array(256)], 1)
	expect(Array.from(peaks.min)).toEqual([0])
	expect(Array.from(peaks.max)).toEqual([0])
})

test("a full scale sine spans minus one to one", () => {
	const peaks = computePeaks([sine(1)], 1)
	expect(peaks.min[0]).toBeCloseTo(-1, 6)
	expect(peaks.max[0]).toBeCloseTo(1, 6)
})

test("a half scale sine spans the half scale amplitude", () => {
	/* The meter reads this amplitude as minus 6.02 dBFS. */
	const peaks = computePeaks([sine(0.5)], 1)
	expect(peaks.min[0]).toBeCloseTo(-0.5, 6)
	expect(peaks.max[0]).toBeCloseTo(0.5, 6)
})

test("peaks split the samples into equal spans", () => {
	const channel = Float32Array.from([0, 1, -1, 0.5, 0.25, -0.75, 0.1, -0.2])
	const peaks = computePeaks([channel], 2)
	expect(Array.from(peaks.min)).toEqual([-1, -0.75])
	expect(Array.from(peaks.max)).toEqual([1, 0.25])
})

test("a shorter channel pads with zero", () => {
	const long = Float32Array.from([0.5, 0.5, 0.5, 0.5])
	const short = Float32Array.from([-1, -1])
	const peaks = computePeaks([long, short], 2)
	expect(Array.from(peaks.min)).toEqual([-1, 0])
	expect(Array.from(peaks.max)).toEqual([0.5, 0.5])
})

test("a bucket over no samples reads zero", () => {
	const peaks = computePeaks([new Float32Array(0)], 2)
	expect(Array.from(peaks.min)).toEqual([0, 0])
	expect(Array.from(peaks.max)).toEqual([0, 0])
})
