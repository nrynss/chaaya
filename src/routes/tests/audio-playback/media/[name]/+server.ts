import { execSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { RequestHandler } from "./$types"

const SAMPLE_RATE = 48000
const TONE_SECONDS = 300
const TONE_HZ = 440
/** The largest slice one range response carries. A small slice stops the
 * browser from buffering the whole file, so a seek must ask for its own
 * bytes. */
const SLICE_BYTES = 1024 * 1024

/** A mono 16 bit wav of a sine at `hz`, `seconds` long. Hertz zero is
 * silence. The tone length keeps a seek near its end far outside whatever
 * the browser buffered. */
function buildWav(seconds: number, hz: number) {
	const frames = SAMPLE_RATE * seconds
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
	const step = (hz * 2 * Math.PI) / SAMPLE_RATE
	for (let frame = 0; frame < frames; frame += 1) {
		view.setInt16(44 + frame * 2, Math.round(Math.sin(frame * step) * 12000), true)
	}
	return bytes
}

const tone = buildWav(TONE_SECONDS, TONE_HZ)

/** A ten second silent wav, the length a dead connection lies about. */
const truncWav = buildWav(10, 0)

/** The attempts whose dying transfer has already been served once, keyed by
 * the attempt number the check puts in its query. The shape is per attempt,
 * so a retried check opens with a fresh truncation, and only this check
 * drives the name. */
const truncAsked = new Set<number>()

/** A ten second AAC in MP4 with two kilobytes of its middle flipped, bytes
 * that decode fine until the flip and then fail inside playback. The
 * encoder is one of the pair the gate requires, so a missing tool fails by
 * name instead of turning into a skip. The bytes build once. */
let corruptMp4: Uint8Array<ArrayBuffer> | null = null
function corruptMp4Bytes(): Uint8Array<ArrayBuffer> {
	if (corruptMp4) return corruptMp4
	const work = mkdtempSync(join(tmpdir(), "playback-media-"))
	try {
		const raw = join(work, "raw.mp4")
		execSync(
			`ffmpeg -v error -f lavfi -i "sine=frequency=440:duration=10:sample_rate=48000" ` +
				`-c:a aac -b:a 96k -movflags +faststart ${raw}`
		)
		const bytes = new Uint8Array(readFileSync(raw))
		const at = Math.floor(bytes.length / 3)
		for (let index = at; index < at + 2048; index += 1) bytes[index] ^= 0xff
		corruptMp4 = bytes
	} finally {
		rmSync(work, { recursive: true, force: true })
	}
	return corruptMp4
}

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
 * with bytes no decoder reads. The corrupt name answers with an MP4 that
 * decodes until mid play, and the truncated name kills its transfer under
 * its own declared length. Every other name answers 404. */
export const GET: RequestHandler = ({ params, request }) => {
	if (params.name === "broken.wav") {
		return new Response(noise, {
			status: 200,
			headers: { "content-type": "audio/wav", "content-length": String(noise.length) }
		})
	}
	if (params.name === "bad.mp4") {
		const bytes = corruptMp4Bytes()
		return new Response(bytes, {
			status: 200,
			headers: {
				"content-type": "audio/mp4",
				"content-length": String(bytes.length),
				"accept-ranges": "none"
			}
		})
	}
	if (params.name === "trunc.wav") {
		/* The first ask of an attempt gets the dying transfer: the response
		 * declares the full length, sends one second, then dies under its
		 * own declaration, the shape a dropped connection leaves behind.
		 * The hole sits past the second the element already holds, so the
		 * failure lands mid play and names the transfer. Every later ask
		 * within the attempt answers with a hard network refusal, so
		 * however the engine schedules its retries under load, the bytes it
		 * asks for never arrive and the element's error keeps naming the
		 * transfer. */
		const attempt = Number(new URL(request.url).searchParams.get("attempt") ?? "0")
		if (truncAsked.has(attempt)) {
			return new Response("the transfer is gone", {
				status: 502,
				headers: { "content-type": "text/plain" }
			})
		}
		truncAsked.add(attempt)
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(truncWav.subarray(0, 44 + SAMPLE_RATE * 2))
				setTimeout(() => controller.error(new Error("connection lost")), 200)
			}
		})
		return new Response(stream, {
			status: 200,
			headers: {
				"content-type": "audio/wav",
				"content-length": String(truncWav.length),
				"accept-ranges": "none"
			}
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
