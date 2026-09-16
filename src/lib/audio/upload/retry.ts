/** The delay before the second attempt, in milliseconds. */
export const retryBaseDelayMs = 250

/** The ceiling the delay doubles up to, in milliseconds. */
export const retryMaxDelayMs = 2000

/** How many attempts one request gets before the upload gives up. */
export const retryMaxAttempts = 10

/**
 * The delay before the attempt that follows the given one. The delay doubles
 * from the base and stops at the ceiling, so a long outage costs no more than
 * a slow poll.
 */
export function retryDelayMs(attempt: number): number {
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
