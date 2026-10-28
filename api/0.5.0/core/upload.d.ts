/** A chunked byte stream a caller opens, fills, and finishes.
 *
 * This is resumable: the caller decides how to retry a block. It is not a
 * one-shot POST. The one-shot siblings are `uploadBlob` and
 * `uploadBlobWithProgress` on `@nrynss/chaaya/upload`, not on this path.
 * `uploadBlob` uses fetch and reports progress once, after settle.
 * `uploadBlobWithProgress` uses XMLHttpRequest and reports socket progress.
 * Neither can resume. A large file belongs here. A short file or a presigned
 * PUT belongs on those helpers.
 *
 * The interface names no route, no hash field, and no error envelope.
 */
export interface Uploader {
    /** Open the upload. */
    start(): Promise<void>;
    /** Hand one captured block over. */
    append(bytes: Uint8Array<ArrayBuffer>): void;
    /** Finish the upload. */
    finish(): Promise<void>;
}
