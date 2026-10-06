import type { RequestHandler } from "./$types"
import { cleanScope, clearScope } from "../storage.js"

/** Drop one run token's parts and counters, so each spec starts clean. */
export const POST: RequestHandler = async ({ url }) => {
	clearScope(cleanScope(url.searchParams.get("scope")))
	return new Response(JSON.stringify({ reset: true }), {
		headers: { "content-type": "application/json" },
	})
}
