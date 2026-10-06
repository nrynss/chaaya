# Upload

What this kit covers for upload, and what it does not, is [scope.md](scope.md).

Three helpers, three jobs. Neither one names a backend.

## Which upload to use

A short file belongs on one-shot. A large file on app routes belongs on chunked `Uploader`. A large file on caller supplied URLs belongs on direct multipart. The table below states each pick once.

- App routes with an adapter: `Uploader` on `@nrynss/chaaya/core`.
- One request, no resume: `uploadBlob` or `uploadBlobWithProgress` on `@nrynss/chaaya/upload`.
- Many part URLs, resumable: `uploadDirectBlob` or `uploadDirectMultipart` on `@nrynss/chaaya/direct-upload`.

## Chunked

`Uploader` on `@nrynss/chaaya/core` is the resumable contract: `start`, `append`, `finish`. An adapter implements it. Keel's chunked protocol is one implementation, on `@nrynss/chaaya/keel`. A large recording belongs there, because a dropped connection can send the missing blocks again.

Core does not know the route, the hash field, or the error envelope. One-shot upload is not exported from core.

## One-shot

Both functions live only on `@nrynss/chaaya/upload`. They send the whole body in one request and cannot resume. Use them for a short file, or for a presigned store URL. A large file belongs on `Uploader`.

`uploadBlob` uses fetch. `onProgress` fires once, after the response settles, with the known size. Fetch cannot see the socket, so that call is not a progress bar.

`uploadBlobWithProgress` is browser-only. It uses `XMLHttpRequest`. `onProgress` is `xhr.upload.onprogress`, so it fires while the bytes are leaving, before the response. A host with no `XMLHttpRequest` rejects with that fact. It does not fall back to fetch. Use `uploadBlob` there.

`timeoutMs` is a positive number of milliseconds, or omitted for no deadline. Zero is refused on both helpers. Fetch would abort immediately, and XMLHttpRequest would treat zero as no timeout.

Both read one `credentials` option. Fetch receives it as-is. XMLHttpRequest sets `withCredentials` only when the value is `"include"`. That flag affects cross-origin requests. Same-origin XHR always sends cookies, so `"omit"` does not strip them there.

`maxBytes` refuses a blob larger than the limit before the request. `FormData` has no size until the browser encodes it. Passing `maxBytes` on `FormData` without `size` throws `UploadSizeUnknown`. The message is the fix: set `maxBytes` only for Blob bodies, or pass an explicit `size`.

A refusal matches `api()`. Pass `parseError` to read a backend envelope. Without it, a non-2xx stays `http_error`.

Prepare, refusal, and progress reporting are shared. Direct multipart calls those, not a second copy of the request.

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

## Direct multipart

Both functions live only on `@nrynss/chaaya/direct-upload`. They send raw bodies straight to caller supplied URLs. They name no route and no store.

`uploadDirectBlob` PUTs one blob with socket progress. It resolves with the receipt header the receiver answered with. Use it for a single presigned URL.

`uploadDirectMultipart` splits a blob into parts of `partSize` bytes and PUTs each part in number order, one at a time. The caller opens the session through `create`, names each part URL through `partUrl`, and closes through `complete`. Parts listed in `completed` are skipped, so an interrupted session resumes without resending stored bytes. Each part retries busy answers with backoff. `onProgress` reports stored bytes plus live socket bytes, so the bar stays monotonic.

```ts
import { uploadDirectMultipart } from "@nrynss/chaaya/direct-upload"

await uploadDirectMultipart(blob, {
  create: async () => ({ uploadId: await openSession() }),
  partUrl: async (uploadId, partNumber) => await signPart(uploadId, partNumber),
  complete: async (uploadId, parts) => await closeSession(uploadId, parts),
}, {
  partSize: 8_000_000,
  credentials: "omit",
  onProgress: (loaded, total) => {
    // loaded grows until total across all parts
  },
})
```

A busy part (408, 429, or 5xx) retries. A refused part throws its `ApiError` and runs `abort` when one is supplied. `directPartRanges`, `remainingPartNumbers`, and `aggregateDirectProgress` expose the splitting, resume, and progress maths for tests.
