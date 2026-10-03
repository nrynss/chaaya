# Upload

Two helpers, two jobs. Neither one names a backend.

## Chunked

`Uploader` on `@nrynss/chaaya/core` is the resumable contract: `start`, `append`, `finish`. An adapter implements it. Keel's chunked protocol is one implementation, on `@nrynss/chaaya/keel`. A large recording belongs there, because a dropped connection can send the missing blocks again.

Core does not know the route, the hash field, or the error envelope.

## One-shot

`uploadBlob` on `@nrynss/chaaya/upload` (also exported from `@nrynss/chaaya/core`) sends the whole body in one request. It cannot resume. Use it for a short file, or for a presigned store URL.

A browser uses `XMLHttpRequest`, so `onProgress` receives socket progress before the response. A host with no `XMLHttpRequest` uses `fetch` and calls `onProgress` once after settle, with the blob size, because fetch does not report upload progress. That fallback is not a progress bar.

`maxBytes` refuses a blob larger than the limit before the request. It does not apply to `FormData`, which has no size until the browser encodes it. Passing `maxBytes` with `FormData` throws `UploadSizeUnknown` instead of skipping the check.

A refusal matches `api()`. Pass `parseError` to read a backend envelope. Without it, a non-2xx stays `http_error`.

### Presigned PUT

Direct-to-storage is a raw body, not a form, and it usually must not send cookies or an app token.

```ts
import { uploadBlob } from "@nrynss/chaaya/upload"

await uploadBlob(signedUrl, blob, {
  method: "PUT",
  formData: false,
  credentials: "omit",
  headers: { "content-type": blob.type },
  onProgress: (loaded, total) => {
    // loaded grows until total
  },
})
```

`credentials: "include"` is the other end of that option, for an app route that uses a cookie. The default leaves cookies on the same origin and does not set `withCredentials`.

### Multipart

The default posts a blob as `FormData` under the field `file`. `fields` adds text parts. A body that is already `FormData` is sent as given. Do not set `Content-Type` yourself. The browser writes the boundary.
