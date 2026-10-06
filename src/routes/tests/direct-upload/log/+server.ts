import type { RequestHandler } from "./$types"
import { attemptCounts, partIndices, writeCounts } from "../storage.js"

/** Report what the harness stored, so a spec checks retries and resume. */
export const GET: RequestHandler = async () => {
	return new Response(
		JSON.stringify({ writes: writeCounts(), attempts: attemptCounts(), received: partIndices() }),
		{
			headers: { "content-type": "application/json" },
		},
	)
}
