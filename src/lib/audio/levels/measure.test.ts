import { expect, test } from "vitest"
import { QUIET_DB, measureBlock, peakAmplitude, rmsAmplitude, toDbfs } from "./measure"

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

test("silence reads the quiet floor in both meters", () => {
	const level = measureBlock(new Float32Array(128))
	expect(level.rmsDb).toBe(QUIET_DB)
	expect(level.peakDb).toBe(QUIET_DB)
})

test("a full scale sine reads zero peak and minus 3.01 rms", () => {
	const level = measureBlock(sine(1))
	expect(level.peakDb).toBeCloseTo(0, 3)
	expect(level.rmsDb).toBeCloseTo(-3.0103, 3)
})

test("a half scale sine peaks at minus 6.02 dBFS", () => {
	const level = measureBlock(sine(0.5))
	expect(level.peakDb).toBeCloseTo(-6.0206, 3)
	expect(level.rmsDb).toBeCloseTo(-9.0309, 3)
})

test("a full scale square wave reads zero in both meters", () => {
	const samples = Float32Array.from({ length: 128 }, (_, index) => (index % 2 === 0 ? 1 : -1))
	const level = measureBlock(samples)
	expect(level.peakDb).toBeCloseTo(0, 3)
	expect(level.rmsDb).toBeCloseTo(0, 3)
})

test("peak and rms measure a block", () => {
	const samples = Float32Array.from([0, 0.5, 0, -0.5])
	expect(peakAmplitude(samples)).toBeCloseTo(0.5, 6)
	expect(rmsAmplitude(samples)).toBeCloseTo(0.353553, 5)
})

test("toDbfs floors an amplitude at or below zero", () => {
	expect(toDbfs(0)).toBe(QUIET_DB)
	expect(toDbfs(-0.5)).toBe(QUIET_DB)
	expect(toDbfs(1)).toBeCloseTo(0, 6)
})
