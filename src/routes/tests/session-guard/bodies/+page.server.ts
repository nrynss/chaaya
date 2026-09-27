import type { PageServerLoad } from "./$types"

/**
 * Isolate the page across origins, so it can build a SharedArrayBuffer. The
 * page renders on the server, because a load that runs only on the client
 * cannot set the headers of the document.
 */
export const load: PageServerLoad = ({ setHeaders }) => {
	setHeaders({
		"cross-origin-opener-policy": "same-origin",
		"cross-origin-embedder-policy": "require-corp",
	})
}
