import { expect, test } from "vitest"
import { computePeaks } from "./peaks"

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
