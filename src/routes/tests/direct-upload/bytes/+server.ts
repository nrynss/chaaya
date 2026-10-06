import { createHash } from "node:crypto"
import type { RequestHandler } from "./$types"
import { partIndices, readPart } from "../storage.js"

/** Assemble stored parts in number order and report their digest. */
export const GET: RequestHandler = async () => {
	const indices = partIndices()
	const chunks = indices.map((index: number) => readPart(index) ?? Buffer.alloc(0))
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
