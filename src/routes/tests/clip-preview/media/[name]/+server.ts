import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { RequestHandler } from "./$types"

/** The largest slice one range response carries, so every answer stays small. */
const SLICE_BYTES = 32 * 1024

const SAMPLE_RATE = 48000
/** The marker clip length, in seconds. */
const MARKER_SECONDS = 2
/** The first beep starts half a second in, and the second starts one
 * second later. The check reads the gap between the two onsets, so the
 * absolute start latency cancels out of the pin. */
const BEEP_ONE_AT = 0.5
const BEEP_TWO_AT = 1.5
/** The beep length, in seconds. */
const BEEP_SECONDS = 0.5
const BEEP_HZ = 1000

/** The committed clip the preview checks play. A VP8 WebM every engine
 * decodes, five minutes of a moving test pattern, silent. The bytes build
 * once per process. */
let clip: Uint8Array<ArrayBuffer> | null = null
function clipBytes(): Uint8Array<ArrayBuffer> {
	if (clip) return clip
	clip = new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/video/clip.webm")))
	return clip
}

/** A mono 16 bit marker: silence, a full scale kilohertz beep, silence,
 * the same beep again, then silence. The two onsets sit one second apart,
 * so the check reads their gap by sample count. */
function markerBytes(): Uint8Array<ArrayBuffer> {
	const frames = SAMPLE_RATE * MARKER_SECONDS
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
	const oneStart = Math.round(SAMPLE_RATE * BEEP_ONE_AT)
	const twoStart = Math.round(SAMPLE_RATE * BEEP_TWO_AT)
	const beepFrames = Math.round(SAMPLE_RATE * BEEP_SECONDS)
	const step = (BEEP_HZ * 2 * Math.PI) / SAMPLE_RATE
	const tone = (frame: number, start: number): number =>
		Math.round(Math.sin((frame - start) * step) * 16000)
	for (let frame = 0; frame < frames; frame += 1) {
		let sample = 0
		if (frame >= oneStart && frame < oneStart + beepFrames) sample = tone(frame, oneStart)
		if (frame >= twoStart && frame < twoStart + beepFrames) sample = tone(frame, twoStart)
		view.setInt16(44 + frame * 2, sample, true)
	}
	return bytes
}

const marker = markerBytes()

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

function ranged(bytes: Uint8Array<ArrayBuffer>, type: string, range: string | null): Response {
	const slice = sliceFor(range, bytes.length)
	if (slice) {
		return new Response(bytes.subarray(slice.start, slice.end + 1), {
			status: 206,
			headers: {
				"content-type": type,
				"accept-ranges": "bytes",
				"content-range": `bytes ${slice.start}-${slice.end}/${bytes.length}`,
				"content-length": String(slice.end - slice.start + 1)
			}
		})
	}
	return new Response(bytes, {
		status: 200,
		headers: { "content-type": type, "accept-ranges": "bytes", "content-length": String(bytes.length) }
	})
}

/** Serve the media the clip preview checks drive. The marker answers with
 * the beep clip. Every other name but the video clip answers 404. */
export const GET: RequestHandler = ({ params, request }) => {
	if (params.name === "clip.webm") {
		return ranged(clipBytes(), "video/webm", request.headers.get("range"))
	}
	if (params.name === "marker.wav") {
		return ranged(marker, "audio/wav", request.headers.get("range"))
	}
	return new Response("gone", { status: 404, headers: { "content-type": "text/plain" } })
}
