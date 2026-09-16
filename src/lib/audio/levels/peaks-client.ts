import { computePeaks, type Peaks, type PeaksRequest } from "./peaks.js"

/**
 * The source text the peaks worker runs. The maths mirror the peaks
 * module, and the worker source tests hold this copy against the real
 * function on uneven channels and empty buckets.
 *
 * The copy is a full copy on purpose. A bundled build renames the peaks
 * module's private helpers, so the worker cannot borrow the function's
 * own source text at runtime. The worker also ships as a string, because
 * a bundled library cannot point a consumer at a stable asset URL. The
 * call hands the text to a blob URL and builds a classic worker from it,
 * which every engine runs without bundler support.
 */
export const PEAKS_WORKER_SOURCE = `
const sampleAt = (channel, frame) => (frame < channel.length ? channel[frame] : 0)
const computePeaks = (channels, buckets) => {
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
const scope = self
scope.onmessage = (event) => {
  const { channels, buckets } = event.data
  const peaks = computePeaks(channels, buckets)
  scope.postMessage({ min: peaks.min, max: peaks.max }, [peaks.min.buffer, peaks.max.buffer])
}
`

/** Compute peaks in a worker so a long file never blocks the page. The call
 * transfers the channel buffers, so the caller gives up its copy and gets
 * the result back without a second allocation. */
export function computePeaksInWorker(
	channels: Float32Array[],
	buckets: number
): Promise<Peaks> {
	if (typeof Worker === "undefined") {
		return Promise.resolve(computePeaks(channels, buckets))
	}
	const source = URL.createObjectURL(new Blob([PEAKS_WORKER_SOURCE], { type: "text/javascript" }))
	const worker = new Worker(source)
	const request: PeaksRequest = { channels, buckets }
	const transfer = channels.map((channel) => channel.buffer as ArrayBuffer)
	const { promise, resolve, reject } = Promise.withResolvers<Peaks>()
	worker.onmessage = (event: MessageEvent<Peaks>) => {
		/* The URL dies here, because revoking it before the fetch finishes
		 * can cancel the script. The worker stops once the answer is in. */
		URL.revokeObjectURL(source)
		worker.terminate()
		resolve(event.data)
	}
	worker.onerror = (event) => {
		URL.revokeObjectURL(source)
		worker.terminate()
		reject(new Error(event.message))
	}
	worker.postMessage(request, transfer)
	return promise
}
