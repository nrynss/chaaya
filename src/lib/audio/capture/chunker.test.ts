import { expect, test } from "vitest"
import { createChunkState, stepChunker, type EmittedChunk } from "./chunker"

/** Collects every block the chunker posts, so a check reads them in order. */
function collector(): { chunks: EmittedChunk[]; emit: (chunk: EmittedChunk) => void } {
	const chunks: EmittedChunk[] = []
	return { chunks, emit: (chunk) => chunks.push(chunk) }
}

test("a full block posts once with its offset and clock reading", () => {
	const state = createChunkState(4)
	const { chunks, emit } = collector()
	stepChunker(state, [Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8])], 1.5, emit, false)
	expect(chunks).toHaveLength(2)
	expect(Array.from(chunks[0].samples)).toEqual([1, 2, 3, 4])
	expect(chunks[0].offset).toBe(0)
	expect(chunks[0].contextTime).toBe(1.5)
	expect(chunks[0].final).toBe(false)
	expect(Array.from(chunks[1].samples)).toEqual([5, 6, 7, 8])
	expect(chunks[1].offset).toBe(4)
	expect(chunks[1].contextTime).toBe(1.5)
})

test("every channel averages into one mono frame", () => {
	const state = createChunkState(2)
	const { chunks, emit } = collector()
	stepChunker(state, [Float32Array.from([1, 1]), Float32Array.from([3, 5])], 0, emit, false)
	expect(Array.from(chunks[0].samples)).toEqual([2, 3])
})

test("a block only posts once it fills", () => {
	const state = createChunkState(4)
	const { chunks, emit } = collector()
	stepChunker(state, [Float32Array.from([1, 2])], 0, emit, false)
	expect(chunks).toHaveLength(0)
	expect(state.filled).toBe(2)
	stepChunker(state, [Float32Array.from([3, 4, 5])], 0, emit, false)
	expect(chunks).toHaveLength(1)
	expect(Array.from(chunks[0].samples)).toEqual([1, 2, 3, 4])
	expect(state.offset).toBe(4)
	expect(state.filled).toBe(1)
})

test("a final step posts the part filled block", () => {
	const state = createChunkState(4)
	const { chunks, emit } = collector()
	stepChunker(state, [Float32Array.from([1, 2, 3])], 2.25, emit, false)
	expect(chunks).toHaveLength(0)
	stepChunker(state, [], 2.5, emit, true)
	expect(chunks).toHaveLength(1)
	expect(Array.from(chunks[0].samples)).toEqual([1, 2, 3])
	expect(chunks[0].offset).toBe(0)
	expect(chunks[0].final).toBe(true)
})

test("a final step closes the take even with no frame left", () => {
	const state = createChunkState(2)
	const { chunks, emit } = collector()
	stepChunker(state, [Float32Array.from([1, 2, 3, 4])], 0, emit, false)
	stepChunker(state, [], 0, emit, true)
	expect(chunks).toHaveLength(3)
	expect(chunks.at(-1)?.samples).toHaveLength(0)
	expect(chunks.at(-1)?.final).toBe(true)
	expect(chunks.at(-1)?.offset).toBe(4)
})

test("a step with no channel posts nothing", () => {
	const state = createChunkState(4)
	const { chunks, emit } = collector()
	stepChunker(state, [], 0, emit, false)
	stepChunker(state, undefined, 0, emit, false)
	expect(chunks).toHaveLength(0)
})

test("144000 frames at 48 kHz are exactly three seconds", () => {
	const frames = 144000
	const state = createChunkState(4096)
	const { chunks, emit } = collector()
	stepChunker(state, [new Float32Array(frames)], 0, emit, true)

	const captured = chunks.reduce((sum, chunk) => sum + chunk.samples.length, 0)
	expect(captured).toBe(frames)
	expect(captured / 48000).toBe(3)
	expect(chunks.map((chunk) => chunk.samples.length)).toEqual([
		...Array.from({ length: 35 }, () => 4096),
		640
	])
	let offset = 0
	for (const chunk of chunks) {
		expect(chunk.offset).toBe(offset)
		offset += chunk.samples.length
	}
	expect(chunks.at(-1)?.final).toBe(true)
})
