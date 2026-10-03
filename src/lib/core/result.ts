/** The reason a parser rejected its input. */
export interface ParseFailure {
	/** A short sentence naming what the input lacked. */
	message: string
}

/** A parsed value, or the failure that replaced it. */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; failure: ParseFailure }

export function ok<T>(value: T): ParseResult<T> {
	return { ok: true, value }
}

export function fail<T>(message: string): ParseResult<T> {
	return { ok: false, failure: { message } }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Decode a JSON text into a value, or fail without throwing. */
export function decodeJson(text: string): ParseResult<unknown> {
	try {
		return ok(JSON.parse(text))
	} catch {
		return fail("the text does not hold valid JSON")
	}
}
