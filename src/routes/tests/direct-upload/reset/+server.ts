import type { RequestHandler } from "./$types"
import { clearAll } from "../storage.js"

/** Drop every stored part and counter, so each spec starts clean. */
export const POST: RequestHandler = async () => {
	clearAll()
	return new Response(JSON.stringify({ reset: true }), {
		headers: { "content-type": "application/json" },
	})
}
