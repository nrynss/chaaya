import type { RequestHandler } from "./$types"
import { currentToken } from "../store.js"

/** Mint a signed URL by redirecting at the run's token. Each visit answers
 * fresh, so a browser that reasks this route after expiry follows a live
 * signature again. */
export const GET: RequestHandler = ({ url }) => {
	const run = url.searchParams.get("run") ?? "default"
	const signed = new URL("/tests/signed/media", url.origin)
	signed.searchParams.set("run", run)
	signed.searchParams.set("token", String(currentToken(run)))
	return new Response(null, {
		status: 302,
		headers: { location: signed.pathname + signed.search }
	})
}
