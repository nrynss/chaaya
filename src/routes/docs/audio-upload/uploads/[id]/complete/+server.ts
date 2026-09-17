import type { RequestHandler } from "./$types";
import { answer, assemble, digestOf, missingIndices, readUpload, refuse } from "../../store";

/** Complete one upload. The route assembles the stored chunks and checks
 * them against the digest the client declared. */
export const POST: RequestHandler = async ({ request, params }) => {
	const upload = readUpload(params.id);
	if (upload === undefined) return refuse(404, "not_found", "No upload carries that id.");
	let declared: unknown;
	try {
		declared = ((await request.json()) as Record<string, unknown>)["sha256"];
	} catch {
		declared = undefined;
	}
	if (typeof declared !== "string" || !/^[0-9a-f]{64}$/.test(declared)) {
		return refuse(400, "invalid_request", "The completion carries no usable digest.");
	}
	const missing = missingIndices(upload);
	if (missing.length > 0) {
		return refuse(409, "incomplete", "The server still lacks part of this upload.", { missing });
	}
	const assembled = assemble(upload);
	const actual = digestOf(assembled);
	if (actual !== declared) {
		return refuse(409, "hash_mismatch", "The assembled upload does not match its digest.", {
			declared,
			actual
		});
	}
	return answer({
		id: upload.id,
		owner: upload.owner,
		content_type: upload.contentType,
		visibility: upload.visibility,
		size_bytes: assembled.length,
		sha256: actual
	});
};
