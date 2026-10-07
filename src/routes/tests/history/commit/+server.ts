import type { RequestHandler } from "./$types";

/** One server document with its revision. */
interface RevisionRecord {
	revision: number;
	doc: string;
}

/**
 * The committed documents by session. The session names the record, so specs
 * running in parallel never share one. A request without it uses the default
 * record.
 */
const records = new Map<string, RevisionRecord>();

/** The record a request names. */
function keyOf(body: { session?: unknown }): string {
	return typeof body.session === "string" ? body.session : "";
}

/** Read one record, so a harness shows exactly its own document. */
export const GET: RequestHandler = ({ url }) => {
	const record = records.get(url.searchParams.get("session") ?? "") ?? { revision: 0, doc: "" };
	return Response.json(record);
};

/**
 * Commit one step, or advance the record as another client. A commit whose
 * base trails the record answers 409 with the server head and applies
 * nothing. A body with remote set to true writes straight through, the way a
 * second client would. A body with mode set to fail answers 500, the way a
 * broken network would.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		session?: unknown;
		base?: unknown;
		doc?: unknown;
		mode?: unknown;
		remote?: unknown;
	};
	const key = keyOf(body);
	if (body.remote === true) {
		const record = records.get(key) ?? { revision: 0, doc: "" };
		const revision = record.revision + 1;
		const doc = typeof body.doc === "string" ? body.doc : record.doc;
		records.set(key, { revision, doc });
		return Response.json({ revision, doc });
	}
	if (body.mode === "fail") return Response.json({ error: "The commit failed." }, { status: 500 });
	const record = records.get(key) ?? { revision: 0, doc: "" };
	if (body.base !== record.revision) {
		return Response.json({ headRevision: record.revision, head: record.doc }, { status: 409 });
	}
	const revision = record.revision + 1;
	const doc = typeof body.doc === "string" ? body.doc : "";
	records.set(key, { revision, doc });
	return Response.json({ revision });
};
