/** A request that reached an API but was refused, or never left the host.
 * The error carries a stable code, so a caller branches on code and never on
 * message. A timeout and a network failure carry status zero, because no
 * response arrived to name one. This client does not know any backend's error
 * body. A caller that has one passes parseError. */
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
/** The stable fields a product's error parser returns. */
export interface ApiFailureBody {
    /** The stable identifier a caller branches on. */
    code: string;
    /** A sentence a caller may show and never branch on. */
    message: string;
    /** Detail the app alone reads. */
    detail?: unknown;
}
/** Read a failed body. Return undefined when the body is not that product's shape. */
export type ApiErrorParser = (text: string, response: Response) => ApiFailureBody | undefined;
/** One request's options. It extends the fetch init, so a caller passes a
 * signal to cancel the request and timeoutMs to give it a deadline. */
export interface ApiRequestInit extends RequestInit {
    /** Abort the request after this many milliseconds. Omit for no deadline. */
    timeoutMs?: number;
    /** Read this response's error body. It wins over the client default. */
    parseError?: ApiErrorParser;
}
/** Defaults for every request a client makes. */
export interface ApiClientOptions {
    /** Read a failed body when the request does not pass its own parser. */
    parseError?: ApiErrorParser;
}
/** Read the seconds a Retry-After header names. Whole seconds count, so an
 * HTTP date or a malformed value reads as absent. Upload shares this. */
export declare function readRetryAfter(response: Response): number | undefined;
/** Keep a detail object as the app's own record, and read anything else as empty. Upload shares this. */
export declare function detailObject(detail: unknown): Record<string, unknown>;
/** Decode a response body into a value. An empty or malformed body reads as
 * null, so a success with no body costs nothing and never throws. Upload shares this. */
export declare function decodeBody(text: string): unknown;
/** Turn a failed response into the one error a caller branches on. A parser
 * that recognises the body supplies the code. A throw or anything else keeps
 * http_error, so a bad body never becomes a network failure. Form actions
 * share this, so a response read outside api() still lands on the same codes. */
export declare function readApiError(response: Response, text: string, parseError?: ApiErrorParser): ApiError;
/** Build a fetch wrapper. Every non-2xx response and every failed request
 * throws an ApiError. Pass parseError to read a backend body. The
 * default client reads none, so a body that is not parsed stays http_error. */
export declare function createApi(options?: ApiClientOptions): ApiClient;
/** A function a caller uses for every request. Adapters supply their own. */
export interface ApiClient {
    <T>(path: string, init?: ApiRequestInit): Promise<T>;
}
/** The shared client. It does not read a backend error body. */
export declare const api: ApiClient;
