import { createHash } from "node:crypto"
import type { RequestHandler } from "./$types"
import { cleanScope, partIndices, readPart } from "../storage.js"

/** Assemble stored parts in number order and report their digest. */
export const GET: RequestHandler = async ({ url }) => {
	const scope = cleanScope(url.searchParams.get("scope"))
	const indices = partIndices(scope)
	const chunks = indices.map((index: number) => readPart(scope, index) ?? Buffer.alloc(0))
	const assembled = Buffer.concat(chunks)
	return new Response(
		JSON.stringify({
			size: assembled.length,
			sha256: createHash("sha256").update(assembled).digest("hex"),
			base64: assembled.toString("base64"),
			received: indices,
		}),
		{ headers: { "content-type": "application/json" } },
	)
}
