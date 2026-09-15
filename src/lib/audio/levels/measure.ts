/** Level measurement for a block of audio samples. The meter reports root
 * mean square and peak amplitude, each as decibels relative to full scale. */

/** The quietest level the meter reports. A digital silence reads this value
 * rather than negative infinity, so a display keeps a number to show. */
export const QUIET_DB = -100

/** Convert a linear amplitude to decibels relative to full scale. An
 * amplitude at or below zero reads QUIET_DB. */
export function toDbfs(amplitude: number): number {
	if (!(amplitude > 0)) return QUIET_DB
	const decibels = 20 * Math.log10(amplitude)
	return decibels > QUIET_DB ? decibels : QUIET_DB
}

/** The largest absolute sample in a block, the peak amplitude. */
export function peakAmplitude(samples: Float32Array): number {
	let peak = 0
	for (let index = 0; index < samples.length; index += 1) {
		const value = Math.abs(samples[index])
		if (value > peak) peak = value
	}
	return peak
}

/** The average sample power in a block, expressed as the root mean square. */
export function rmsAmplitude(samples: Float32Array): number {
	if (samples.length === 0) return 0
	let sum = 0
	for (let index = 0; index < samples.length; index += 1) {
		const value = samples[index]
		sum += value * value
	}
	return Math.sqrt(sum / samples.length)
}

/** One level reading, in decibels relative to full scale. */
export interface Level {
	rmsDb: number
	peakDb: number
}

/** Measure one block of samples into a level reading. */
export function measureBlock(samples: Float32Array): Level {
	return {
		rmsDb: toDbfs(rmsAmplitude(samples)),
		peakDb: toDbfs(peakAmplitude(samples))
	}
}

/** Read the current time domain block from an analyser and measure it. The
 * caller owns the buffer, so a meter reuses one allocation. */
export function measureAnalyser(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): Level {
	analyser.getFloatTimeDomainData(buffer)
	return measureBlock(buffer)
}
