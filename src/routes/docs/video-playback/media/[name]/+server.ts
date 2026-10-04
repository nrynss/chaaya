import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { RequestHandler } from "./$types"

/** The committed clip the docs player drives. A VP8 WebM every engine
 * decodes, five minutes of a moving test pattern, silent. The bytes build
 * once per process. */
let clip: Uint8Array<ArrayBuffer> | null = null
function clipBytes(): Uint8Array<ArrayBuffer> {
	if (clip) return clip
	clip = new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/video/clip.webm")))
	return clip
}

/** Serve the clip the docs player loads, plays, and seeks. Every other name
 * answers 404. */
export const GET: RequestHandler = ({ params }) => {
	if (params.name !== "clip.webm") {
		return new Response("gone", { status: 404, headers: { "content-type": "text/plain" } })
	}
	const bytes = clipBytes()
	return new Response(bytes, {
		status: 200,
		headers: {
			"content-type": "video/webm",
			"accept-ranges": "bytes",
			"content-length": String(bytes.length)
		}
	})
}
