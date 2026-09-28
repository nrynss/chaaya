import { type ParseResult } from "../../wire/index.js";
import type { UploadError, UploadReceipt, UploadSnapshot } from "./types.js";
/** A request that did not succeed, and whether another attempt may answer it. */
export declare class UploadFailure extends Error implements UploadError {
    readonly code: string;
    readonly retryable: boolean;
    readonly detail?: unknown;
    constructor(code: string, message: string, options?: {
        detail?: unknown;
        retryable?: boolean;
    });
}
/**
 * Turn any thrown value into the failure an upload reports. A transport that
 * answered nothing is the network, and the network always deserves another
 * attempt.
 */
export declare function toUploadFailure(error: unknown): UploadFailure;
/** The body that opens an upload. The size stays undeclared, because a live
 * capture has no known length. */
export declare function beginBody(options: {
    readonly owner: string;
    readonly contentType: string;
    readonly visibility: string;
    readonly chunkSize: number;
}): string;
/** The body that completes an upload. */
export declare function completeBody(sha256: string): string;
/** The path of one upload. */
export declare function uploadPath(base: string, id: string): string;
/** The path one chunk writes to. */
export declare function chunkPath(base: string, id: string, index: number): string;
/** The path that completes one upload. */
export declare function completePath(base: string, id: string): string;
/** Parse the state body a begin, a chunk write or a state read returns. */
export declare function parseUploadSnapshot(body: string): ParseResult<UploadSnapshot>;
/** Parse the receipt a completed upload returns. */
export declare function parseUploadReceipt(body: string): ParseResult<UploadReceipt>;
/**
 * Turn a refused response into the failure an upload reports. The envelope
 * carries the stable code every rejection shares, and the status alone decides
 * whether another attempt may answer it.
 */
export declare function refusal(response: Response): Promise<UploadFailure>;
