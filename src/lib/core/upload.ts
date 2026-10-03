/** A chunked byte stream a caller opens, fills, and finishes. One-shot
 * upload is a separate helper. It is not this interface. The interface names
 * no route, no hash field, and no error envelope. */
export interface Uploader {
	/** Open the upload. */
	start(): Promise<void>
	/** Hand one captured block over. */
	append(bytes: Uint8Array<ArrayBuffer>): void
	/** Finish the upload. */
	finish(): Promise<void>
}
