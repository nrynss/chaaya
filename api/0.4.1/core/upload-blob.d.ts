import { ApiError, type ApiErrorParser } from "./api.js";
/** A file refused before it is sent, because it is past the caller's limit. */
export declare class UploadTooLarge extends Error {
    readonly code = "too_large";
    readonly size: number;
    readonly limit: number;
    constructor(size: number, limit: number);
}
/** `maxBytes` was set, and this body has no size the caller named. */
export declare class UploadSizeUnknown extends Error {
    readonly code = "size_unknown";
    constructor();
}
/** Options for one short upload. This is not the chunked `Uploader`. */
export interface BlobUploadOptions {
    /** Headers such as a bearer token. A multipart body drops Content-Type so the boundary stays intact.
     * A signed URL often sends no Authorization header. Set Content-Type here when the store requires one. */
    headers?: HeadersInit;
    /** Cookie policy, read by both transports.
     * Fetch receives this value as-is. Omit it and fetch keeps its default, which sends cookies on the same origin.
     * XMLHttpRequest sets `withCredentials` only when this is `"include"`. That flag affects cross-origin requests.
     * Same-origin XHR always sends cookies, so `"omit"` does not strip them there. */
    credentials?: RequestCredentials;
    /** Extra text fields when the body is a blob posted as multipart. Ignored when body is already FormData. */
    fields?: Readonly<Record<string, string>>;
    /** False posts a blob as the raw body. Use that for a presigned PUT. Default true. Ignored when body is FormData. */
    formData?: boolean;
    /** Form field name for a blob. Default file. */
    field?: string;
    /** File name the multipart part carries. */
    filename?: string;
    /** HTTP method. Default POST. A presigned store URL is usually PUT. */
    method?: string;
    /** Abort the request. */
    signal?: AbortSignal;
    /** Give up after this many milliseconds. Omit for no deadline.
     * Zero is refused. Fetch would abort immediately, and XMLHttpRequest would wait forever. */
    timeoutMs?: number;
    /** Refuse a larger body before any request is sent.
     * A Blob is measured by `size`. FormData has no size until the browser encodes it, so pass `size` or omit `maxBytes`.
     * Otherwise this throws `UploadSizeUnknown` instead of skipping the check. */
    maxBytes?: number;
    /** Byte length the caller already knows. Required when `maxBytes` is set on FormData.
     * Must be a finite, non-negative length. A Blob uses its own `size` and ignores this. */
    size?: number;
    /** Bytes handed to the socket, and the total when one is known.
     * `uploadBlob` calls this once, after the response, with the known size (0 when FormData has no `size`).
     * `uploadBlobWithProgress` calls this from `xhr.upload.onprogress`, including samples before the response. */
    onProgress?: (loaded: number, total: number) => void;
    /** Read a refused body. Omit and a non-2xx stays http_error. */
    parseError?: ApiErrorParser;
}
/** A body ready to send. A later multipart helper should reuse this instead of rebuilding the request. */
export interface UploadPrepared {
    method: string;
    headers: Headers;
    payload: FormData | Blob;
    /** Known byte length, or 0 when the body is FormData and the caller passed no size. */
    size: number;
}
/** The same refusal `api()` builds. A parser throw stays http_error.
 * The XHR path uses this. The fetch path uses `api()`, which applies the same rule.
 * `headers` are the ones the transport saw, including Retry-After. */
export declare function uploadFailure(status: number, statusText: string, text: string, headers: Headers, parseError: ApiErrorParser | undefined): ApiError;
/** The one progress callback both transports call. A multipart helper should call this too, not a second shape. */
export declare function reportUploadProgress(onProgress: BlobUploadOptions["onProgress"], loaded: number, total: number): void;
/** Measure, limit, and shape one body. Blob and FormData share this, and a later part upload should too. */
export declare function prepareUpload(body: Blob | FormData, options: BlobUploadOptions): UploadPrepared;
/** Fetch transport. Progress is one call after settle. `#31` should not copy this request. */
export declare function sendUpload<T>(url: string, prepared: UploadPrepared, options: BlobUploadOptions): Promise<T>;
/** XMLHttpRequest transport. Progress is `xhr.upload.onprogress`. `#31` should send parts through this. */
export declare function sendUploadWithProgress<T>(url: string, prepared: UploadPrepared, options: BlobUploadOptions): Promise<T>;
/**
 * Send one short blob or form with fetch.
 *
 * This is the one-shot sibling of `Uploader`. `Uploader` is chunked (`start`,
 * `append`, `finish`) and can resume. This helper sends the whole body in one
 * request and cannot resume. A large file belongs on `Uploader`.
 *
 * `onProgress` fires once, after the response settles, with the known size.
 * Fetch cannot see the socket. Use `uploadBlobWithProgress` when the bar must
 * move while the bytes are leaving.
 *
 * A presigned store URL is `method: "PUT"`, `formData: false`, and
 * `credentials: "omit"`. Pass no Authorization header unless the signer asked
 * for one. The raw blob is the body.
 *
 * A refusal matches `api()`: `parseError` may name the code, otherwise it is
 * `http_error`. A blob past `maxBytes` throws `UploadTooLarge` and never leaves
 * the caller. `maxBytes` on FormData without `size` throws `UploadSizeUnknown`.
 * `timeoutMs` is a positive number of milliseconds, or omitted for no deadline.
 * Zero is refused here and on `uploadBlobWithProgress`.
 */
export declare function uploadBlob<T>(url: string, body: Blob | FormData, options?: BlobUploadOptions): Promise<T>;
/**
 * Send one short blob or form with XMLHttpRequest. Browser only.
 *
 * `onProgress` is `xhr.upload.onprogress`. It fires while the body is uploading,
 * before the response. The host must provide `XMLHttpRequest`. Without that
 * constructor (Node, or any other runtime that has none) the promise rejects
 * with "uploadBlobWithProgress needs XMLHttpRequest". It does not fall back
 * to fetch. Use `uploadBlob` there.
 *
 * `credentials` is the same option `uploadBlob` reads. `"include"` sets
 * `withCredentials`. That flag only affects cross-origin requests. Same-origin
 * XHR sends cookies either way.
 *
 * `maxBytes` and `size` are the same check `uploadBlob` runs, before any
 * request. A Blob is measured by its own `size`. FormData uses the explicit
 * `size`. The presigned PUT and the refusal shape match `uploadBlob` too.
 * `timeoutMs` matches too: a positive number, or omitted. Zero is refused.
 */
export declare function uploadBlobWithProgress<T>(url: string, body: Blob | FormData, options?: BlobUploadOptions): Promise<T>;
