import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { RequestHandler } from "./$types"

/** The largest slice one range response carries, so every answer stays
 * small. */
const SLICE_BYTES = 32 * 1024

/** The committed clip the video follower checks feed. A VP8 WebM every
 * engine decodes, five minutes of a moving test pattern, silent, small
 * enough to ship beside the checks. The length keeps a seek near its end
 * outside every engine's read ahead window. The bytes build once per
 * process. */
let clip: Uint8Array<ArrayBuffer> | null = null
function clipBytes(): Uint8Array<ArrayBuffer> {
	if (clip) return clip
	clip = new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/video/clip.webm")))
	return clip
}

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

/** Serve the clip the video follower checks drive. Every other name
 * answers 404. A range ask gets its own capped slice, and a plain ask gets
 * the whole file, so every engine can buffer and decode it its own way. */
export const GET: RequestHandler = ({ params, request }) => {
	if (params.name !== "clip.webm") {
		return new Response("gone", { status: 404, headers: { "content-type": "text/plain" } })
	}
	const bytes = clipBytes()
	const slice = sliceFor(request.headers.get("range"), bytes.length)
	if (slice) {
		return new Response(bytes.subarray(slice.start, slice.end + 1), {
			status: 206,
			headers: {
				"content-type": "video/webm",
				"accept-ranges": "bytes",
				"content-range": `bytes ${slice.start}-${slice.end}/${bytes.length}`,
				"content-length": String(slice.end - slice.start + 1)
			}
		})
	}
	return new Response(bytes, {
		status: 200,
		headers: {
			"content-type": "video/webm",
			"accept-ranges": "bytes",
			"content-length": String(bytes.length)
		}
	})
}
