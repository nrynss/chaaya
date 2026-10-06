import type { RequestHandler } from "./$types"

/** The fallback answer for the poll harness. A spec usually intercepts this
 * route and scripts its own failures, so this answer only serves a manual
 * visit. It never ends the watch on its own. */
export const GET: RequestHandler = async () => {
	return new Response(JSON.stringify({ status: "running", current: 1 }), {
		headers: { "content-type": "application/json" }
	})
}
