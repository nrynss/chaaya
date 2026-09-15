/** Peak computation over a long recording. The work belongs in a worker, so
 * a twenty minute file never blocks the page that asked for it. */

/** Min and max sample per bucket. Each bucket covers the same span of every
 * channel, so the arrays line up with a drawing of a fixed width. */
export interface Peaks {
	min: Float32Array
	max: Float32Array
}

/** A request for peaks. A caller sends channel data and a bucket count. */
export interface PeaksRequest {
	channels: Float32Array[]
	buckets: number
}

/** Read one sample from a channel, or zero when the channel ends early. */
function sampleAt(channel: Float32Array, frame: number): number {
	return frame < channel.length ? channel[frame] : 0
}

/** Compute the min and max sample per bucket across every channel. A bucket
 * that covers no sample reads zero. */
export function computePeaks(channels: Float32Array[], buckets: number): Peaks {
	const count = Math.max(1, Math.floor(buckets))
	const frames = channels.reduce((longest, channel) => Math.max(longest, channel.length), 0)
	const min = new Float32Array(count)
	const max = new Float32Array(count)
	for (let bucket = 0; bucket < count; bucket += 1) {
		const start = Math.floor((bucket * frames) / count)
		const end = Math.floor(((bucket + 1) * frames) / count)
		let low = Infinity
		let high = -Infinity
		for (let frame = start; frame < end; frame += 1) {
			for (const channel of channels) {
				const value = sampleAt(channel, frame)
				if (value < low) low = value
				if (value > high) high = value
			}
		}
		min[bucket] = low === Infinity ? 0 : low
		max[bucket] = high === -Infinity ? 0 : high
	}
	return { min, max }
}
