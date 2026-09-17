/** A request that reached the API but was refused, or never left the host.
 * The error carries the contract's stable code, so a caller branches on code
 * and never on message. A timeout and a network failure carry status zero,
 * because no response arrived to name one. */
export declare class ApiError extends Error {
    /** The stable identifier a caller branches on. */
    readonly code: string;
    /** The HTTP status, or zero when no response arrived. */
    readonly status: number;
    /** The detail object the app alone reads, empty when the body carried none. */
    readonly detail: Record<string, unknown>;
    /** The seconds a 429 tells the caller to wait, when the header names one. */
    readonly retryAfterSeconds?: number;
    constructor(message: string, code: string, status: number, detail?: Record<string, unknown>, retryAfterSeconds?: number);
}
/** One request's options. It extends the fetch init, so a caller passes a
 * signal to cancel the request and timeoutMs to give it a deadline. */
export interface ApiRequestInit extends RequestInit {
    /** Abort the request after this many milliseconds. Omit for no deadline. */
    timeoutMs?: number;
}
/** Fetch wrapper against the one error shape the API guarantees. Every
 * non-2xx response and every failed request throws an ApiError. A caller
 * stops the request with a signal, gives it a deadline with timeoutMs, and
 * reads the retry hint a 429 sends. */
export declare function api<T>(path: string, init?: ApiRequestInit): Promise<T>;
