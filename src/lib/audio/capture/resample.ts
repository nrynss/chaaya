import type { CaptureChunk } from "./types.js"

/**
 * Rate conversion for a captured take. The audio thread renders at the rate
 * its context runs at, which a browser may set from the device rather than
 * from the requested rate. These functions bring the frames to the rate the
 * take declares, so a player reads them at the right speed.
 */

/** Resamples mono frames to another rate by linear interpolation. Equal rates
 * hand the same array straight back, because no frame has to move. */
export function resampleLinear(
	samples: Float32Array,
	fromRate: number,
	toRate: number
): Float32Array {
	if (fromRate === toRate || samples.length === 0) return samples
	const frames = Math.max(1, Math.round((samples.length * toRate) / fromRate))
	const target = new Float32Array(frames)
	const step = fromRate / toRate
	for (let index = 0; index < frames; index += 1) {
		const position = index * step
		const lower = Math.floor(position)
		const upper = Math.min(lower + 1, samples.length - 1)
		const fraction = position - lower
		target[index] = samples[lower] * (1 - fraction) + samples[upper] * fraction
	}
	return target
}

/**
 * Resamples every block of a take and renumbers the offsets. Equal rates hand
 * the same list back, so a take that already matches costs nothing.
 */
export function resampleChunks(
	chunks: readonly CaptureChunk[],
	fromRate: number,
	toRate: number
): readonly CaptureChunk[] {
	if (fromRate === toRate) return chunks
	const converted: CaptureChunk[] = []
	let offset = 0
	for (const chunk of chunks) {
		const samples = resampleLinear(chunk.samples, fromRate, toRate)
		converted.push({ samples, offset, contextTime: chunk.contextTime })
		offset += samples.length
	}
	return converted
}
