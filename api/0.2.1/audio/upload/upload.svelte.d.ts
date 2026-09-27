import type { UploadError, UploadOptions, UploadReceipt, UploadState, UploadStore } from "./types.js";
/**
 * Streams one capture to the upload protocol.
 *
 * A caller opens the upload, hands every captured block to append(), and calls
 * finish() when the capture stops. The uploader splits the capture into fixed
 * size chunks, hashes each chunk with Web Crypto, persists it, and streams it
 * to the server. A failed chunk retries with backoff. The upload stays pending
 * in IndexedDB until every chunk is acknowledged, so a reloaded page resumes
 * with resume().
 *
 * start() and finish() resolve when their work ends, and the state reports the
 * outcome. A caller reads state, error and receipt instead of catching.
 */
export declare class ChunkUploader {
    #private;
    /** Where the upload stands. */
    state: UploadState;
    /** The id the server gave the upload, once it opened. */
    id: string | undefined;
    /** How many bytes the capture has handed over. */
    capturedBytes: number;
    /** How many chunks the server has acknowledged. */
    acknowledged: number;
    /** How many chunks wait for a send. */
    pending: number;
    /** How many failed attempts will run again. */
    retries: number;
    /** How many bytes the server holds. */
    stored: number;
    /** What a finished upload reported. */
    receipt: UploadReceipt | undefined;
    /** Why the upload stopped, when it failed. */
    error: UploadError | undefined;
    constructor(options: UploadOptions);
    /**
     * Open the upload on the server and record it, so a reloaded page finds
     * it. The open is not retried, because nothing has been sent yet and the
     * caller can open again.
     */
    start(): Promise<void>;
    /**
     * Hand one captured block to the upload. The chunker splits it, and every
     * chunk persists before it is sent. A block that arrives before the open
     * answers waits, and enters the chunker in arrival order once the open
     * resolves, so a caller streams with start() followed by appends straight
     * from ondataavailable. A block that arrives after finish() is ignored.
     */
    append(bytes: Uint8Array<ArrayBuffer>): void;
    /**
     * Stop taking capture and complete the upload.
     *
     * It releases the short tail as the last chunk, waits until the server
     * acknowledges every chunk it holds, and only then sends the completion.
     * The whole file digest comes from the stored chunks, so a resumed page
     * completes with exactly the bytes it recovered.
     *
     * A second finish() while one is in flight awaits the first instead of
     * sending a second completion. A real server deletes the live upload as
     * it completes, so a second POST answers not_found and would flip a
     * finished upload to failed after the receipt arrived.
     */
    finish(): Promise<void>;
    /**
     * Pick up the newest upload a page left behind. It reads the stored
     * session, asks the server what it already holds, and queues the chunks
     * that are still missing. It returns undefined when nothing waits.
     *
     * A reloaded page lost its capture stream, so it finishes what it
     * recovered. The caller decides that by calling finish().
     */
    static resume(store?: UploadStore): Promise<ChunkUploader | undefined>;
}
