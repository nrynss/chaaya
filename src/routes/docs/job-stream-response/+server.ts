import { createJobStreamResponse } from "$lib/sveltekit/index.js"
import type { RequestHandler } from "./$types"

/** Tiny demo feed. The page follows it with fetch and shows the raw bytes. */
export const GET: RequestHandler = ({ request, url }) => {
	const watch = url.searchParams.get("watch") ?? "demo"
	const frames = [
		{ id: 1, event: "progress", data: JSON.stringify({ step: "encode", done: 1, of: 2, watch }) },
		{ id: 2, event: "progress", data: JSON.stringify({ step: "encode", done: 2, of: 2, result: "/out.bin", watch }) },
		{ id: 3, event: "done", data: JSON.stringify({ watch }) },
	]
	return createJobStreamResponse(frames, { signal: request.signal })
}
