import type { RequestHandler } from "./$types";
import { answer, byteLimit, chunkLimit, digestOf, readUpload, refuse, snapshot } from "../../../store";

/** Write one chunk. The digest travels beside the bytes, so the route can
 * refuse a chunk that arrived damaged. */
export const PUT: RequestHandler = async ({ request, params }) => {
	const upload = readUpload(params.id);
	if (upload === undefined) return refuse(404, "not_found", "No upload carries that id.");
	const index = Number(params.index);
	const body = Buffer.from(await request.arrayBuffer());
	if (!Number.isInteger(index) || index < 0 || index >= chunkLimit()) {
		return refuse(400, "invalid_request", "The chunk index lies outside the allowed range.");
	}
	if (body.length === 0) return refuse(400, "invalid_request", "The chunk carries no bytes.");
	if (body.length > upload.chunkSize)
		return refuse(400, "invalid_request", "The chunk is longer than the chunk size.");
	const declared = request.headers.get("x-chunk-sha256");
	if (typeof declared !== "string" || !/^[0-9a-f]{64}$/.test(declared)) {
		return refuse(400, "invalid_request", "The chunk carries no usable digest.");
	}
	let total = 0;
	for (const chunk of upload.chunks.values()) total += chunk.bytes.length;
	if (!upload.chunks.has(index) && total + body.length > byteLimit()) {
		return refuse(413, "limit_exceeded", "The upload is larger than this collection allows.");
	}
	const actual = digestOf(body);
	if (actual !== declared) {
		return refuse(400, "chunk_mismatch", "The chunk does not match the digest it declared.", {
			index,
			declared,
			actual
		});
	}
	upload.chunks.set(index, { bytes: Buffer.from(body), sha256: actual });
	return answer(snapshot(upload));
};
