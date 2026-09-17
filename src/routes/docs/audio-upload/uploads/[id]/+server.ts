import type { RequestHandler } from "./$types";
import { answer, readUpload, refuse, snapshot } from "../store";

/** Read what one upload holds. The uploader polls here while it streams. */
export const GET: RequestHandler = ({ params }) => {
	const upload = readUpload(params.id);
	if (upload === undefined) return refuse(404, "not_found", "No upload carries that id.");
	return answer(snapshot(upload));
};
