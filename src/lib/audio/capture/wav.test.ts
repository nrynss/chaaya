import { expect, test } from "vitest"
import type { CaptureChunk } from "./types"
import { encodeWav } from "./wav"

function chunk(samples: number[], offset = 0, contextTime = 0): CaptureChunk {
	return { samples: Float32Array.from(samples), offset, contextTime }
}

function tag(view: DataView, offset: number, length: number): string {
	let text = ""
	for (let index = 0; index < length; index += 1) {
		text += String.fromCharCode(view.getUint8(offset + index))
	}
	return text
}

test("the header names the rate, the channels and the byte length", async () => {
	const blob = encodeWav([chunk([0, 0.5, -0.5])], 48000)
	const view = new DataView(await blob.arrayBuffer())
	expect(blob.type).toBe("audio/wav")
	expect(tag(view, 0, 4)).toBe("RIFF")
	expect(tag(view, 8, 4)).toBe("WAVE")
	expect(tag(view, 12, 4)).toBe("fmt ")
	expect(tag(view, 36, 4)).toBe("data")
	expect(view.getUint16(20, true)).toBe(1)
	expect(view.getUint16(22, true)).toBe(1)
	expect(view.getUint32(24, true)).toBe(48000)
	expect(view.getUint32(28, true)).toBe(96000)
	expect(view.getUint16(32, true)).toBe(2)
	expect(view.getUint16(34, true)).toBe(16)
	expect(view.getUint32(4, true)).toBe(view.byteLength - 8)
	expect(view.getUint32(40, true)).toBe(6)
	expect(blob.size).toBe(50)
})

test("the frames follow the header in the order they were captured", async () => {
	const blob = encodeWav([chunk([0, 1, -1], 0, 1.5), chunk([0.5], 3, 2.5)], 48000)
	const view = new DataView(await blob.arrayBuffer())
	expect(view.getInt16(44, true)).toBe(0)
	expect(view.getInt16(46, true)).toBe(32767)
	expect(view.getInt16(48, true)).toBe(-32768)
	expect(view.getInt16(50, true)).toBe(16384)
	expect(blob.size).toBe(44 + 8)
})

test("a take with no frames is a header and nothing else", async () => {
	const blob = encodeWav([], 44100)
	const view = new DataView(await blob.arrayBuffer())
	expect(blob.size).toBe(44)
	expect(view.getUint32(24, true)).toBe(44100)
	expect(view.getUint32(40, true)).toBe(0)
})
