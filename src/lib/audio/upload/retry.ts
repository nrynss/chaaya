/** The delay before the second attempt, in milliseconds. */
export const retryBaseDelayMs = 250

/** The ceiling the delay doubles up to, in milliseconds. */
export const retryMaxDelayMs = 2000

/** How many attempts one request gets before the upload gives up. */
export const retryMaxAttempts = 6

/**
 * The delay before the attempt that follows the given one. The delay doubles
 * from the base and stops at the ceiling. Null means the attempts are spent,
 * so the caller gives up instead of waiting.
 */
export function retryDelayMs(attempt: number): number | null {
	if (attempt < 1 || attempt >= retryMaxAttempts) return null
	return Math.min(retryBaseDelayMs * 2 ** (attempt - 1), retryMaxDelayMs)
}

/**
 * Whether a refused request is worth another attempt. A status of 408, 429 or
 * 5xx names a server that is busy or broken, so the same request may land
 * later. Every other status is an answer, and a second attempt repeats it.
 */
export function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500
}
