import { type ApiErrorParser } from "../core/api.js";
/** One finished part the completion call carries. */
export interface DirectCompletedPart {
    /** One based part number. */
    partNumber: number;
    /** Store receipt the part PUT answered with. */
    etag: string;
}
/** One part range inside a blob. End is exclusive. */
export interface DirectPartRange {
    /** One based part number. */
    partNumber: number;
    /** First byte of the part. */
    start: number;
    /** One past the last byte of the part. */
    end: number;
}
/** Caller supplied session URLs. The module names no route and no store. */
export interface DirectUploadProviders<T> {
    /** Open a session and hand back its id. */
    create(): Promise<{
        uploadId: string;
    }>;
    /** Presigned URL for one part number. */
    partUrl(uploadId: string, partNumber: number): Promise<string> | string;
    /** Close the session after every part lands. */
    complete(uploadId: string, parts: DirectCompletedPart[]): Promise<T>;
    /** Abandon the session. Omit when the backend needs no abort. */
    abort?(uploadId: string): Promise<void>;
}
/** Options for one raw PUT straight to a caller supplied URL. */
export interface DirectBlobOptions {
    /** Extra headers. Omit Authorization unless the signer asked for it. */
    headers?: HeadersInit;
    /** Cookie policy. Omit it and the transport keeps its default. */
    credentials?: RequestCredentials;
    /** Abort the request. */
    signal?: AbortSignal;
    /** Give up after this many milliseconds. Omit for no deadline. */
    timeoutMs?: number;
    /** Bytes handed to the socket, and the total when one is known. */
    onProgress?: (loaded: number, total: number) => void;
    /** Read a refused body. Omit and a non-2xx stays http_error. */
    parseError?: ApiErrorParser;
}
/** Options for a multipart session over caller supplied URLs. */
export interface DirectMultipartOptions extends DirectBlobOptions {
    /** Longest part in bytes. Must be a positive integer. */
    partSize: number;
    /** Attempts per part before the session gives up. Default 6. */
    maxAttempts?: number;
    /** Parts already stored. The session skips them. */
    completed?: readonly DirectCompletedPart[];
    /** Delay before the attempt after the given one. Defaults to the backoff below. */
    retryDelay?: (attempt: number) => number | null;
    /** Wait helper. Defaults to a setTimeout promise. Tests inject a no wait clock. */
    wait?: (ms: number) => Promise<void>;
    /** Fires when one part lands, in part order. */
    onPart?: (part: DirectCompletedPart) => void;
}
/** Delay before the second attempt, in milliseconds. */
export declare const directRetryBaseMs = 250;
/** Ceiling the delay doubles up to, in milliseconds. */
export declare const directRetryMaxMs = 2000;
/** Attempts one part gets before the session gives up. */
export declare const directRetryMaxAttempts = 6;
/**
 * Delay before the attempt after the given one. The delay doubles from the
 * base and stops at the ceiling. Null means the attempts are spent, so the
 * caller gives up instead of waiting.
 */
export declare function directRetryDelayMs(attempt: number): number | null;
/**
 * Whether a refused part is worth another attempt. A status of 408, 429, or
 * 5xx names a receiver that is busy or broken, so the same PUT may land
 * later. Every other status is an answer, and a second PUT repeats it.
 */
export declare function isDirectRetryableStatus(status: number): boolean;
/**
 * Split a byte length into one based part ranges. The last range is short
 * when the length is no multiple of the part size. An empty blob yields one
 * empty range, so the session still sends one PUT and completes.
 */
export declare function directPartRanges(size: number, partSize: number): DirectPartRange[];
/**
 * Part numbers that still need a PUT. The result is sorted and holds no
 * duplicates. Numbers outside one through partCount fall away, so a stale
 * receipt cannot schedule a part the session never created.
 */
export declare function remainingPartNumbers(partCount: number, completed: readonly number[]): number[];
/**
 * Add one progress sample to a running total. Finished parts contribute
 * their full size. Live parts contribute the bytes the socket reports.
 */
export declare function aggregateDirectProgress(finishedBytes: number, liveLoaded: readonly number[]): number;
/**
 * PUT one raw blob through XMLHttpRequest. Progress is socket progress, so
 * the bar moves while the bytes leave. The promise resolves with the ETag
 * the receiver answered with, or an empty string when it sent none.
 */
export declare function uploadDirectBlob(url: string, body: Blob, options?: DirectBlobOptions): Promise<string>;
/**
 * Upload a blob in parts through caller supplied URLs, then complete.
 *
 * The caller opens the session through create, names each part URL through
 * partUrl, and closes through complete. Parts go in number order, one at a
 * time, so progress stays monotonic and a log reads in order. Parts listed
 * in completed are skipped, so an interrupted session resumes without
 * resending stored bytes. Each part PUT retries busy answers with the
 * backoff above. onProgress reports stored bytes plus live socket bytes.
 */
export declare function uploadDirectMultipart<T>(blob: Blob, providers: DirectUploadProviders<T>, options: DirectMultipartOptions): Promise<T>;
