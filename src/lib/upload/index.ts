/**
 * One-shot upload. The chunked contract stays `Uploader` on
 * `@nrynss/chaaya/core`. These helpers send one body and do not resume.
 * `uploadBlob` is fetch. `uploadBlobWithProgress` is XMLHttpRequest.
 * It names no backend and no audio format.
 */
export { UploadSizeUnknown, UploadTooLarge, uploadBlob, uploadBlobWithProgress } from "../core/upload-blob.js"
export type { BlobUploadOptions } from "../core/upload-blob.js"
export type { Uploader } from "../core/upload.js"
