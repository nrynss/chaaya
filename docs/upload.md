# Upload

Two helpers, two jobs. Neither one names a backend.

## Chunked

`Uploader` on `@nrynss/chaaya/core` is the resumable contract: `start`, `append`, `finish`. An adapter implements it. Keel's chunked protocol is one implementation, on `@nrynss/chaaya/keel`. A large recording belongs there, because a dropped connection can send the missing blocks again.

Core does not know the route, the hash field, or the error envelope. One-shot upload is not exported from core.

## One-shot

Both functions live only on `@nrynss/chaaya/upload`. They send the whole body in one request and cannot resume. Use them for a short file, or for a presigned store URL. A large file belongs on `Uploader`.

`uploadBlob` uses fetch. `onProgress` fires once, after the response settles, with the known size. Fetch cannot see the socket, so that call is not a progress bar.

`uploadBlobWithProgress` is browser-only. It uses `XMLHttpRequest`. `onProgress` is `xhr.upload.onprogress`, so it fires while the bytes are leaving, before the response. A host with no `XMLHttpRequest` rejects with that fact. It does not fall back to fetch. Use `uploadBlob` there.

Both read one `credentials` option. Fetch receives it as-is. XMLHttpRequest sets `withCredentials` only when the value is `"include"`. That flag affects cross-origin requests. Same-origin XHR always sends cookies, so `"omit"` does not strip them there.

`maxBytes` refuses a blob larger than the limit before the request. `FormData` has no size until the browser encodes it. Passing `maxBytes` on `FormData` without `size` throws `UploadSizeUnknown`. The message is the fix: set `maxBytes` only for Blob bodies, or pass an explicit `size`.

A refusal matches `api()`. Pass `parseError` to read a backend envelope. Without it, a non-2xx stays `http_error`.

Prepare, refusal, and progress reporting are shared. A later direct-to-storage multipart helper should call those, not a second copy of the request.

### Presigned PUT

Direct-to-storage is a raw body, not a form, and it usually must not send cookies or an app token. Use the progress helper when the file is large enough to show a bar.

```ts
import { uploadBlobWithProgress } from "@nrynss/chaaya/upload"

await uploadBlobWithProgress(signedUrl, blob, {
  method: "PUT",
  formData: false,
  credentials: "omit",
  headers: { "content-type": blob.type },
  onProgress: (loaded, total) => {
    // loaded grows until total, from xhr.upload.onprogress
  },
})
```

`credentials: "include"` is the other end of that option, for an app route that uses a cookie. On XMLHttpRequest it sets `withCredentials`, which only changes a cross-origin request.

`uploadBlob` is the same call on fetch, with one progress sample after settle.

### Multipart

The default posts a blob as `FormData` under the field `file`. `fields` adds text parts. A body that is already `FormData` is sent as given. Do not set `Content-Type` yourself. The browser writes the boundary. Pass `size` when `maxBytes` must apply to that form.
