import { expect, test } from "vitest"
import { computePeaks, type Peaks, type PeaksRequest } from "./peaks.js"
import { PEAKS_WORKER_SOURCE } from "./peaks-client.js"

interface WorkerAnswer {
	message: Peaks
	transfer: ArrayBuffer[]
}

/** Run the shipped worker source inside a fake worker scope. The fake
 * records the answer and its transfer list, so the test sees what a real
 * worker would hand back to the page. */
function runWorkerSource(request: PeaksRequest): WorkerAnswer {
	const scope: {
		onmessage: ((event: { data: PeaksRequest }) => void) | null
		postMessage: (message: Peaks, transfer: ArrayBuffer[]) => void
	} = { onmessage: null, postMessage: () => {} }
	let answer: WorkerAnswer | undefined
	scope.postMessage = (message, transfer) => {
		answer = { message, transfer }
	}
	new Function("self", PEAKS_WORKER_SOURCE)(scope)
	if (!scope.onmessage) throw new Error("The worker source registered no message handler.")
	scope.onmessage({ data: request })
	if (!answer) throw new Error("The worker source posted no answer.")
	return answer
}

test("the worker source matches the module function on uneven channels", () => {
	/* The second channel ends early, so the reads past its end take the
	 * zero path while the first channel still runs. A drifted copy of that
	 * read would leak other frames into these buckets and break the parity. */
	const channels = [Float32Array.from([0.5, -0.9, 0.5, -0.9, 0.5]), Float32Array.from([1, -1])]
	const result = runWorkerSource({ channels, buckets: 3 })
	const expected = computePeaks(channels, 3)
	expect(Array.from(result.message.min)).toEqual(Array.from(expected.min))
	expect(Array.from(result.message.max)).toEqual(Array.from(expected.max))
	expect(Array.from(result.message.min)).toEqual([0.5, -1, Math.fround(-0.9)])
	expect(Array.from(result.message.max)).toEqual([1, 0.5, 0.5])
})

test("the worker source reads silence where a bucket holds no samples", () => {
	const channels = [Float32Array.from([0.5, -0.9, 0.5, -0.9])]
	const result = runWorkerSource({ channels, buckets: 6 })
	expect(Array.from(result.message.min)).toEqual([0, 0.5, Math.fround(-0.9), 0, 0.5, Math.fround(-0.9)])
	expect(Array.from(result.message.max)).toEqual([0, 0.5, Math.fround(-0.9), 0, 0.5, Math.fround(-0.9)])
})

test("the worker source hands back its own buffers on the transfer list", () => {
	const channels = [Float32Array.from([0.5])]
	const result = runWorkerSource({ channels, buckets: 1 })
	expect(result.transfer).toEqual([result.message.min.buffer, result.message.max.buffer])
})
