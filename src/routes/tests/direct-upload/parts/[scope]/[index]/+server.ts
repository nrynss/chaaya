import { createHash } from "node:crypto"
import type { RequestHandler } from "./$types"
import { cleanScope, consumeFailure, noteAttempt, partIndices, readPart, storePart } from "../../../storage.js"

/** Receive one part as a raw body. A forced failure answers 503 first. */
export const PUT: RequestHandler = async ({ params, request }) => {
	const scope = cleanScope(params.scope ?? null)
	const index = Number(params.index)
	if (!Number.isInteger(index) || index < 1) {
		return new Response(JSON.stringify({ code: "invalid_part" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		})
	}
	noteAttempt(scope, index)
	if (consumeFailure(scope, index)) {
		return new Response(JSON.stringify({ code: "busy", message: "The receiver is busy." }), {
			status: 503,
			headers: { "content-type": "application/json" },
		})
	}
	const bytes = Buffer.from(await request.arrayBuffer())
	storePart(scope, index, bytes)
	const etag = createHash("sha256").update(bytes).digest("hex")
	return new Response(JSON.stringify({ part: index, size: bytes.length }), {
		headers: { "content-type": "application/json", etag },
	})
}

/** Read one stored part back, so a spec checks byte exactness per part. */
export const GET: RequestHandler = async ({ params }) => {
	const scope = cleanScope(params.scope ?? null)
	const index = Number(params.index)
	const held = readPart(scope, index)
	if (held === undefined) {
		return new Response(JSON.stringify({ code: "missing" }), {
			status: 404,
			headers: { "content-type": "application/json" },
		})
	}
	return new Response(
		JSON.stringify({ part: index, size: held.length, base64: held.toString("base64"), indices: partIndices(scope) }),
		{ headers: { "content-type": "application/json" } },
	)
}
