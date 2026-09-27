import type { RequestHandler } from "./$types";

/**
 * The close notices each session sent, as the bodies the server read. A
 * notice with no body records an empty string. The session query parameter
 * names the record, so specs running in parallel never share one. A request
 * without it uses the default record the docs page writes.
 */
const records = new Map<string, string[]>();

/** The record a request names. */
function key(url: URL): string {
	return url.searchParams.get("session") ?? "";
}

/** Read one record, so a spec pins exactly one close and the body it carried. */
export const GET: RequestHandler = ({ url }) => {
	const bodies = records.get(key(url)) ?? [];
	return Response.json({ closes: bodies.length, bodies });
};

/** Record one close and its body. Beacon and keepalive posts both land here. */
export const POST: RequestHandler = async ({ request, url }) => {
	const body = await request.text();
	const bodies = records.get(key(url)) ?? [];
	bodies.push(body);
	records.set(key(url), bodies);
	return Response.json({ closes: bodies.length });
};

/** Clear one record, so each spec run starts from zero. */
export const DELETE: RequestHandler = ({ url }) => {
	records.delete(key(url));
	return Response.json({ closes: 0 });
};
