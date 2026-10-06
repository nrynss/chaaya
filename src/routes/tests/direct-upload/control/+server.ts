import type { RequestHandler } from "./$types"
import { setFailures } from "../storage.js"

/** Force the next PUTs to one part to answer 503. A spec scripts retries. */
export const POST: RequestHandler = async ({ request }) => {
	let decoded: unknown
	try {
		decoded = await request.json()
	} catch {
		decoded = null
	}
	const body = (decoded ?? {}) as { index?: unknown; times?: unknown }
	const index = typeof body.index === "number" ? body.index : 0
	const times = typeof body.times === "number" ? body.times : 0
	if (!Number.isInteger(index) || index < 1 || !Number.isInteger(times) || times < 0) {
		return new Response(JSON.stringify({ code: "invalid_part" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		})
	}
	setFailures(index, times)
	return new Response(JSON.stringify({ held: index, times }), {
		headers: { "content-type": "application/json" },
	})
}
