/** The delay before the second attempt, in milliseconds. */
export declare const retryBaseDelayMs = 250;
/** The ceiling the delay doubles up to, in milliseconds. */
export declare const retryMaxDelayMs = 2000;
/** How many attempts one request gets before the upload gives up. */
export declare const retryMaxAttempts = 10;
/**
 * The delay before the attempt that follows the given one. The delay doubles
 * from the base and stops at the ceiling, so a long outage costs no more than
 * a slow poll.
 */
export declare function retryDelayMs(attempt: number): number;
/**
 * Whether a refused request is worth another attempt. A status of 408, 429 or
 * 5xx names a server that is busy or broken, so the same request may land
 * later. Every other status is an answer, and a second attempt repeats it.
 */
export declare function isRetryableStatus(status: number): boolean;
