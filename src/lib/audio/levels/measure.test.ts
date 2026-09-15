import { expect, test } from "vitest"
import { QUIET_DB, measureBlock, peakAmplitude, rmsAmplitude, toDbfs } from "./measure"

test("a digital silence reads the quiet floor", () => {
	const level = measureBlock(new Float32Array(128))
	expect(level.rmsDb).toBe(QUIET_DB)
	expect(level.peakDb).toBe(QUIET_DB)
	expect(level.rmsDb).toBeLessThan(-60)
})

test("a full scale square wave reads full scale", () => {
	const samples = Float32Array.from({ length: 128 }, (_, index) => (index % 2 === 0 ? 1 : -1))
	const level = measureBlock(samples)
	expect(Math.abs(level.rmsDb)).toBeLessThanOrEqual(1)
	expect(Math.abs(level.peakDb)).toBeLessThanOrEqual(1)
})

test("a half scale amplitude reads about minus six decibels", () => {
	expect(toDbfs(0.5)).toBeCloseTo(-6.0206, 3)
})

test("peak and rms measure a block", () => {
	const samples = Float32Array.from([0, 0.5, 0, -0.5])
	expect(peakAmplitude(samples)).toBeCloseTo(0.5, 6)
	expect(rmsAmplitude(samples)).toBeCloseTo(0.353553, 5)
})
