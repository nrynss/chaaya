import { createApi, type ApiClient, type ApiErrorParser, type ApiFailureBody } from "../../core/api.js"
import { parseErrorEnvelope } from "./wire/index.js"

/** Read Keel's `{ error: { code, message, detail? } }` envelope. Anything else is left for http_error. */
export const keelErrorParser: ApiErrorParser = (text) => {
	const parsed = parseErrorEnvelope(text)
	if (!parsed.ok) return undefined
	const { code, message, detail } = parsed.value.error
	const body: ApiFailureBody = { code, message }
	if (detail !== undefined) body.detail = detail
	return body
}

/** Fetch client that reads Keel's error envelope. The generic `api` does not. */
export const api: ApiClient = createApi({ parseError: keelErrorParser })
