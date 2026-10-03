/** A chunked byte stream a caller opens, fills, and finishes.
 *
 * This is resumable: the caller decides how to retry a block. It is not a
 * one-shot POST. The one-shot sibling is `uploadBlob` in this package
 * (`@nrynss/chaaya/upload` and `@nrynss/chaaya/core`). That helper sends the
 * whole body once, reports browser upload progress, and cannot resume.
 * A large file belongs here. A short file or a presigned PUT belongs on
 * `uploadBlob`.
 *
 * The interface names no route, no hash field, and no error envelope.
 */
export interface Uploader {
	/** Open the upload. */
	start(): Promise<void>
	/** Hand one captured block over. */
	append(bytes: Uint8Array<ArrayBuffer>): void
	/** Finish the upload. */
	finish(): Promise<void>
}
