import { error, fail, type ActionFailure } from "@sveltejs/kit"
import { ApiError, readApiError, type ApiErrorParser } from "../core/api.js"

/** The fields a form result and an error page share with ApiError.
 * `code` is what a caller branches on. It is the ApiError code, unchanged. */
export interface ActionErrorData {
	/** The stable identifier a caller branches on. */
	code: string
	/** A sentence a caller may show and never branch on. */
	message: string
	/** Detail the app alone reads. Empty when the error carried none. */
	detail: Record<string, unknown>
	/** The seconds a 429 told the caller to wait, when the error named one. */
	retryAfterSeconds?: number
}

/** A refused response whose body the app's parser can read.
 * Pass text, because a Response body reads once. */
export interface ApiFailureSource {
	/** The refused response. Status and Retry-After come from here. */
	response: Response
	/** The body text already read from the response. */
	text: string
	/** The app's parser. Omit it and a body that is not parsed stays http_error. */
	parseError?: ApiErrorParser
}

/** An ApiError, or a refused response to turn into one. */
export type ApiErrorInput = ApiError | ApiFailureSource

/** Read an ApiError, or build one from a response with the app's parser. */
function asApiError(source: ApiErrorInput): ApiError {
	if (source instanceof ApiError) return source
	if (!(source.response instanceof Response) || typeof source.text !== "string") {
		throw new TypeError("A form error needs an ApiError, or a response and its body text.")
	}
	return readApiError(source.response, source.text, source.parseError)
}

/** Copy the stable fields. The code is the ApiError code. */
export function toActionData(source: ApiErrorInput): ActionErrorData {
	const failure = asApiError(source)
	const data: ActionErrorData = {
		code: failure.code,
		message: failure.message,
		detail: failure.detail,
	}
	if (failure.retryAfterSeconds !== undefined) data.retryAfterSeconds = failure.retryAfterSeconds
	return data
}

/** The status SvelteKit's fail() and error() accept.
 * An integer from 400 to 599 passes through. `timeout` becomes 504.
 * `network` becomes 503. Any other status becomes 502. The code is not changed. */
export function actionStatus(source: ApiErrorInput): number {
	const failure = asApiError(source)
	if (Number.isInteger(failure.status) && failure.status >= 400 && failure.status <= 599) {
		return failure.status
	}
	if (failure.code === "timeout") return 504
	if (failure.code === "network") return 503
	return 502
}

/** Use the override when the caller passed one. Otherwise use actionStatus. */
function statusFor(source: ApiErrorInput, override: number | undefined): number {
	if (override === undefined) return actionStatus(source)
	if (!Number.isInteger(override) || override < 400 || override > 599) {
		throw new RangeError(`A form status must be an integer from 400 to 599, not ${String(override)}`)
	}
	return override
}

/** Return this from a form action. The data keeps the ApiError code. */
export function failFromApiError(
	source: ApiErrorInput,
	status?: number,
): ActionFailure<ActionErrorData> {
	const failure = asApiError(source)
	return fail(statusFor(failure, status), toActionData(failure))
}

/** Throw this from a load or an action that should render the error page.
 * The thrown body keeps the ApiError code. SvelteKit types that body as
 * App.Error, whose default is message. Extend App.Error to type the code. */
export function errorFromApiError(source: ApiErrorInput, status?: number): never {
	const failure = asApiError(source)
	error(statusFor(failure, status), toActionData(failure))
}
