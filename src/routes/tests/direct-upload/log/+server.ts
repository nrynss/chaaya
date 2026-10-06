import type { RequestHandler } from "./$types"
import { attemptCounts, cleanScope, partIndices, writeCounts } from "../storage.js"

/** Report what the harness stored, so a spec checks retries and resume. */
export const GET: RequestHandler = async ({ url }) => {
	const scope = cleanScope(url.searchParams.get("scope"))
	return new Response(
		JSON.stringify({ writes: writeCounts(scope), attempts: attemptCounts(scope), received: partIndices(scope) }),
		{
			headers: { "content-type": "application/json" },
		},
	)
}
