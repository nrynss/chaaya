import type { RequestHandler } from "./$types"
import { rotateToken } from "../store.js"

/** Expire every signed URL the run minted so far. The check calls it
 * between play and seek, so expiry comes from the route and never from a
 * sleep. */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { run?: string }
	const run = typeof body.run === "string" && body.run !== "" ? body.run : "default"
	return new Response(JSON.stringify({ token: rotateToken(run) }), {
		headers: { "content-type": "application/json" }
	})
}
