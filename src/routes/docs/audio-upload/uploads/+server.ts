import type { RequestHandler } from "./$types";
import { answer, expiry, isCount, nextId, refuse, snapshot, writeUpload } from "./store";
import type { Upload } from "./store";

/** Open one upload. The page posts its owner, content type, visibility,
 * and chunk size here, and the route answers the snapshot it streams. */
export const POST: RequestHandler = async ({ request }) => {
	let decoded: Record<string, unknown>;
	try {
		decoded = (await request.json()) as Record<string, unknown>;
	} catch {
		return refuse(400, "invalid_request", "The body does not hold valid JSON.");
	}
	const owner = decoded["owner"];
	const contentType = decoded["content_type"];
	const visibility = decoded["visibility"];
	const chunkSize = decoded["chunk_size"];
	if (typeof owner !== "string" || owner === "")
		return refuse(400, "invalid_request", "The owner is missing.");
	if (typeof contentType !== "string" || contentType === "")
		return refuse(400, "invalid_request", "The content type is missing.");
	if (typeof visibility !== "string" || visibility === "")
		return refuse(400, "invalid_request", "The visibility is missing.");
	if (!isCount(chunkSize) || chunkSize <= 0)
		return refuse(400, "invalid_request", "The chunk size is missing.");
	const upload: Upload = {
		id: nextId(),
		owner,
		contentType,
		visibility,
		chunkSize,
		expiresAt: expiry(),
		chunks: new Map()
	};
	writeUpload(upload);
	return answer(snapshot(upload), 201);
};
