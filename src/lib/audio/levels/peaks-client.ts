import { computePeaks, type Peaks, type PeaksRequest } from "./peaks.js"

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
	const worker = new Worker(new URL("./peaks.worker.ts", import.meta.url), {
		type: "module"
	})
	const request: PeaksRequest = { channels, buckets }
	const transfer = channels.map((channel) => channel.buffer as ArrayBuffer)
	const { promise, resolve, reject } = Promise.withResolvers<Peaks>()
	worker.onmessage = (event: MessageEvent<Peaks>) => {
		worker.terminate()
		resolve(event.data)
	}
	worker.onerror = (event) => {
		worker.terminate()
		reject(new Error(event.message))
	}
	worker.postMessage(request, transfer)
	return promise
}
