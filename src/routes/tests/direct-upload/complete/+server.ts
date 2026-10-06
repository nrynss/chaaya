import { createHash } from "node:crypto"
import type { RequestHandler } from "./$types"
import { cleanScope, readPart } from "../storage.js"

/** Close a session over the stored parts. Missing parts refuse with 409. */
export const POST: RequestHandler = async ({ request, url }) => {
	const scope = cleanScope(url.searchParams.get("scope"))
	let decoded: unknown
	try {
		decoded = await request.json()
	} catch {
		decoded = null
	}
	const parts = ((decoded ?? {}) as { parts?: unknown }).parts
	if (!Array.isArray(parts) || parts.length === 0) {
		return new Response(JSON.stringify({ code: "invalid_parts" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		})
	}
	const ordered = [...parts].sort(
		(left: { partNumber: number }, right: { partNumber: number }) => left.partNumber - right.partNumber,
	)
	const chunks: Buffer[] = []
	for (const part of ordered) {
		const held = readPart(scope, part.partNumber)
		if (held === undefined) {
			return new Response(JSON.stringify({ code: "incomplete", missing: [part.partNumber] }), {
				status: 409,
				headers: { "content-type": "application/json" },
			})
		}
		const etag = createHash("sha256").update(held).digest("hex")
		if (part.etag !== etag) {
			return new Response(JSON.stringify({ code: "mismatch", part: part.partNumber }), {
				status: 409,
				headers: { "content-type": "application/json" },
			})
		}
		chunks.push(held)
	}
	const assembled = Buffer.concat(chunks)
	return new Response(
		JSON.stringify({
			size: assembled.length,
			sha256: createHash("sha256").update(assembled).digest("hex"),
			parts: ordered.length,
		}),
		{ headers: { "content-type": "application/json" } },
	)
}
