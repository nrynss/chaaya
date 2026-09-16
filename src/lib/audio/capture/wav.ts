import type { CaptureChunk } from "./types.js"

/** The bytes a canonical WAV header occupies before the audio. */
const HEADER_BYTES = 44

/** The byte width of one 16 bit sample. */
const SAMPLE_BYTES = 2

/** The WAV format tag for uncompressed integer PCM. */
const PCM_FORMAT = 1

/** One audio channel, because the capture mixes the input to mono. */
const CHANNELS = 1

function writeTag(view: DataView, offset: number, tag: string): void {
	for (let index = 0; index < tag.length; index += 1) {
		view.setUint8(offset + index, tag.charCodeAt(index))
	}
}

/**
 * Packs mono float frames into a 16 bit PCM WAV blob at the given rate. The
 * header names the rate, the channel count and the byte length, so any decoder
 * reads the frame count straight from the file.
 */
export function encodeWav(chunks: readonly CaptureChunk[], sampleRate: number): Blob {
	let frames = 0
	for (const chunk of chunks) frames += chunk.samples.length
	const dataBytes = frames * SAMPLE_BYTES
	const view = new DataView(new ArrayBuffer(HEADER_BYTES + dataBytes))
	writeTag(view, 0, "RIFF")
	view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true)
	writeTag(view, 8, "WAVE")
	writeTag(view, 12, "fmt ")
	view.setUint32(16, 16, true)
	view.setUint16(20, PCM_FORMAT, true)
	view.setUint16(22, CHANNELS, true)
	view.setUint32(24, sampleRate, true)
	view.setUint32(28, sampleRate * CHANNELS * SAMPLE_BYTES, true)
	view.setUint16(32, CHANNELS * SAMPLE_BYTES, true)
	view.setUint16(34, 16, true)
	writeTag(view, 36, "data")
	view.setUint32(40, dataBytes, true)
	let offset = HEADER_BYTES
	for (const chunk of chunks) {
		for (let index = 0; index < chunk.samples.length; index += 1) {
			const sample = Math.max(-1, Math.min(1, chunk.samples[index]))
			view.setInt16(offset, Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)), true)
			offset += SAMPLE_BYTES
		}
	}
	return new Blob([view.buffer], { type: "audio/wav" })
}
