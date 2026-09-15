import type { RequestHandler } from "./$types"

const SAMPLE_RATE = 48000
const TONE_SECONDS = 300
const TONE_HZ = 440
/** The largest slice one range response carries. A small slice stops the
 * browser from buffering the whole file, so a seek must ask for its own
 * bytes. */
const SLICE_BYTES = 1024 * 1024

/** A mono 16 bit tone, long enough that a seek near its end lands far outside
 * whatever the browser buffered. */
function buildTone() {
	const frames = SAMPLE_RATE * TONE_SECONDS
	const dataBytes = frames * 2
	const bytes = new Uint8Array(new ArrayBuffer(44 + dataBytes))
	const view = new DataView(bytes.buffer)
	const write = (offset: number, text: string) => {
		for (let index = 0; index < text.length; index += 1) {
			bytes[offset + index] = text.charCodeAt(index)
		}
	}
	write(0, "RIFF")
	view.setUint32(4, 36 + dataBytes, true)
	write(8, "WAVE")
	write(12, "fmt ")
	view.setUint32(16, 16, true)
	view.setUint16(20, 1, true)
	view.setUint16(22, 1, true)
	view.setUint32(24, SAMPLE_RATE, true)
	view.setUint32(28, SAMPLE_RATE * 2, true)
	view.setUint16(32, 2, true)
	view.setUint16(34, 16, true)
	write(36, "data")
	view.setUint32(40, dataBytes, true)
	const step = (TONE_HZ * 2 * Math.PI) / SAMPLE_RATE
	for (let frame = 0; frame < frames; frame += 1) {
		view.setInt16(44 + frame * 2, Math.round(Math.sin(frame * step) * 12000), true)
	}
	return bytes
}

const tone = buildTone()

/** Bytes that carry no audio header, so no decoder reads them. */
const noise = new Uint8Array(400_000)
for (let index = 0; index < noise.length; index += 1) noise[index] = (index * 97) % 256

interface Slice {
	start: number
	end: number
}

/** The byte slice one range header asks for, capped so a response stays
 * small. A missing or malformed header has no slice. */
function sliceFor(rangeHeader: string | null, size: number): Slice | null {
	if (!rangeHeader) return null
	const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
	if (!match) return null
	const start = match[1] === "" ? Math.max(0, size - Number(match[2])) : Number(match[1])
	const wanted = match[2] === "" ? size - 1 : Number(match[2])
	return { start, end: Math.min(wanted, start + SLICE_BYTES - 1, size - 1) }
}

/** Serve the media a browser playback test needs. The broken name answers 200
 * with bytes no decoder reads, and every other name answers 404. */
export const GET: RequestHandler = ({ params, request }) => {
	if (params.name === "broken.wav") {
		return new Response(noise, {
			status: 200,
			headers: { "content-type": "audio/wav", "content-length": String(noise.length) }
		})
	}
	if (params.name !== "tone.wav") {
		return new Response("gone", { status: 404, headers: { "content-type": "text/plain" } })
	}
	const slice = sliceFor(request.headers.get("range"), tone.length)
	if (slice) {
		return new Response(tone.subarray(slice.start, slice.end + 1), {
			status: 206,
			headers: {
				"content-type": "audio/wav",
				"accept-ranges": "bytes",
				"content-range": `bytes ${slice.start}-${slice.end}/${tone.length}`,
				"content-length": String(slice.end - slice.start + 1)
			}
		})
	}
	/** A request with no range header takes this branch. The response states
	 * the true length and sends the first slice through a stream that never
	 * closes, so the body does not finish arriving. The held tail does not
	 * carry the pin, because a browser seeks for its own bytes even after it
	 * buffers the whole file. */
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(tone.subarray(0, SLICE_BYTES))
		}
	})
	return new Response(stream, {
		status: 200,
		headers: {
			"content-type": "audio/wav",
			"accept-ranges": "bytes",
			"content-length": String(tone.length)
		}
	})
}
