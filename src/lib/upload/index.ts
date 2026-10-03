/**
 * One-shot upload. The chunked contract stays `Uploader` on
 * `@nrynss/chaaya/core`. This helper sends one body and does not resume.
 * It names no backend and no audio format.
 */
export { UploadSizeUnknown, UploadTooLarge, uploadBlob } from "../core/upload-blob.js"
export type { BlobUploadOptions } from "../core/upload-blob.js"
export type { Uploader } from "../core/upload.js"
