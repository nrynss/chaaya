import type { RequestHandler } from "./$types";

/** How many close notices reached the server. */
let closes = 0;

/** Read the count, so a spec pins exactly one close per session. */
export const GET: RequestHandler = () => {
	return Response.json({ closes });
};

/** Record one close. Beacon and keepalive posts both land here. */
export const POST: RequestHandler = () => {
	closes += 1;
	return Response.json({ closes });
};

/** Reset the count, so each spec run starts from zero. */
export const DELETE: RequestHandler = () => {
	closes = 0;
	return Response.json({ closes });
};
