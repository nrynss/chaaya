import { computePeaks, type PeaksRequest } from "./peaks"

/** Worker entry for peak computation. A long file runs here, so the page
 * that asked for the peaks keeps answering input while the numbers form. */
const worker = globalThis as unknown as {
	onmessage: ((event: MessageEvent<PeaksRequest>) => void) | null
	postMessage: (message: unknown, transfer: Transferable[]) => void
}

worker.onmessage = (event) => {
	const { channels, buckets } = event.data
	const peaks = computePeaks(channels, buckets)
	worker.postMessage({ min: peaks.min, max: peaks.max }, [
		peaks.min.buffer as ArrayBuffer,
		peaks.max.buffer as ArrayBuffer
	])
}
