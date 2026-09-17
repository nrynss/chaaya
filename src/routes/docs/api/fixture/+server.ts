import type { RequestHandler } from "./$types";

/** One failed answer shaped like the wire envelope a client branches on. */
const rateLimited = {
	error: {
		code: "rate_limited",
		message: "Too many requests.",
		detail: { retry_after_seconds: 12 }
	}
};

/** The fixture endpoint the docs page branches on. It answers 429 with a
 * retry hint, so the page reads a typed error code and never the wording. */
export const GET: RequestHandler = () =>
	new Response(JSON.stringify(rateLimited), {
		status: 429,
		headers: {
			"content-type": "application/json",
			"retry-after": "12"
		}
	});
