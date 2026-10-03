# Review: one-shot upload, issue 11, round 1

Written by GLM 5.3 Flash, a coding agent review. Like the other model notes on the sibling
branches, this file rides the branch and records one model's read. It is not a maintainer
approval.

- Hash reviewed: `96cccc0f26750b7778c6733c3ed6261d5102c858` (branch `issue-11-oneshot-upload`, 3
  commits on `main` `ddc87c3`)
- Worktree: `/home/nryn/work/chaaya-wt/issue11-rev-r1` (detached at the hash)
- Spec: GitHub issue nrynss/chaaya#11, a one-shot multipart / blob upload helper (the issue's
  option 2, which the issue prefers)
- Scope read: the full `main...96cccc0` diff (9 files), `src/lib/core/upload-blob.ts` and its test
  file in full, `src/lib/core/api.ts` for the refusal contract the fetch path inherits, the new
  `./upload` export and barrel, and the docs and route changes.

## What the gate measured in this worktree

`npm ci`, then `./tools/check.sh`. Exit 1 at the first step. svelte-check found 1 error:

```
src/lib/core/upload-blob.ts:241:12
Error: Argument of type 'BodyInit' is not assignable to parameter of type
'XMLHttpRequestBodyInit | Document | null | undefined'.
  Type 'ReadableStream<any>' is not assignable to ...
```

Nothing after svelte-check ran in the gate. Finding 1 is that error.

Because the gate stopped there, I measured the rest by hand in this worktree, in the gate's own
order: eslint, the Svelte 4 leakage scan, the visual values scan, and the Keel fixture byte diff
all pass. The vitest suite passes 223 tests in 30 files, including the 9 new upload tests. The
Playwright leg passes on chromium and firefox bare (192 tests) and on webkit inside the pinned
image (`mcr.microsoft.com/playwright:v1.63.0-noble` with the static ffprobe pair, 90 tests).
svelte-package, publint, the published-api check (deferred, no `api/0.3.0` record yet), the
published-types probe (unpacks the tarball, imports every export key including the new
`@nrynss/chaaya/upload`, and typechecks the barrels), the server-safety import under plain node,
the consumer-name scan, and the plan-reference scan all pass.

Note what that means: the generated `.d.ts` is clean and the packed package works. The defect is
source-level only. It still blocks the gate, which is the baseline every change must pass.

The pins below ran in this worktree as temporary test files and were deleted afterwards
(`git status --porcelain`, 0 lines).

## Spec compliance (issue 11)

| Requirement | Verdict |
| --- | --- |
| Thin one-shot uploader for short files with custom headers (option 2) | Met. `uploadBlob` (fetch) and `uploadBlobWithProgress` (XMLHttpRequest). Custom headers pass through; the multipart path drops `Content-Type` so the browser writes the boundary. |
| Short files | Met. `maxBytes` refuses before any request, and a Blob is measured by its own `size`. `FormData` has no size until the browser encodes it, so `maxBytes` there throws `UploadSizeUnknown` unless the caller passes `size`. Both refusals are pinned by tests that assert `fetch` was never called. |
| Multipart or raw | Met. The default wraps a Blob as `FormData` under `file` with extra `fields`; `formData: false` sends the raw body with its own type, which is the presigned PUT. Both are pinned. |
| Not the chunked path, not audio | Met. The new `./upload` subpath exports the two helpers and the error classes. `Uploader` is untouched and the module comment now names it as the resumable sibling. |
| Progress | Met. One call after settle on fetch, `xhr.upload.onprogress` on XHR, through one shared `reportUploadProgress` seam. |

The refusal shape matches `api()` on both transports: a parser throw stays `http_error`,
`Retry-After` whole seconds are kept, and a decoded JSON body is returned on 2xx.

## Findings

| Severity | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| H | `src/lib/core/upload-blob.ts` line 70 (`payload: BodyInit` in `UploadPrepared`) and line 241 (`xhr.send(prepared.payload)`). | The gate is red at its first step. `BodyInit` includes `ReadableStream`, which `XMLHttpRequestBodyInit` refuses, so svelte-check fails on `xhr.send(prepared.payload)`. `prepareUpload` only ever builds `FormData` or `Blob`, so the runtime is safe and the generated declarations are clean, but every source-level check fails and the gate measures nothing past step one. | `npm run check` in this worktree prints the error above and exits 1. | Narrow `UploadPrepared.payload` to `FormData \| Blob`, the only shapes `prepareUpload` builds. svelte-check then passes and the rest of the gate runs. Reintroduce by widening the field back to `BodyInit`. |
| L | `src/lib/core/upload-blob.ts`, `uploadFailure`. | On the XHR path, `parseError` receives a synthetic `Response` built from text, status, and statusText only. It carries no headers. A parser that reads `response.headers` (request id, rate-limit scope, retry policy) sees them through `uploadBlob` and sees nothing through `uploadBlobWithProgress`. `Retry-After` is passed separately, so that one header still lands in `retryAfterSeconds`. | A temporary pin written, run, and deleted in this worktree: a FakeXHR whose `getResponseHeader("retry-after")` returns `7`, with a `parseError` that records `response.headers.get("retry-after")`. The XHR path passes null. The same header reaches a parser on the fetch path. | Build the synthetic `Response` with the headers the XHR saw. The pin flipped in this worktree when the synthetic response carried the header (measured, then reverted). |
| L | `src/lib/core/upload-blob.ts` lines 81 to 99. | `detailObject`, `decodeBody`, and `readRetryAfter` are private copies of primitives `core/api.ts` already carries, and `core/result.ts` exports the decoder set for exactly this sharing. The same duplication class the kit-by-design review flagged in the Keel adapter. | `grep -n "^function detailObject\|^function decodeBody\|^function readRetryAfter" src/lib/core/upload-blob.ts src/lib/core/api.ts` returns both sets. | Delete the three locals and import the shared ones. The suite passes unchanged, because the primitives are pure. |

## Review questions

1. **Did a Svelte 4 idiom slip in?** No. The leakage scan passes (run by hand, since the gate
   aborted before it). The branch adds no component and no reactive class.
2. **Does a module touch a browser global at import time?** No. The server-safety probe imported
   `@nrynss/chaaya/upload` under plain node and passed. `XMLHttpRequest`, `File`, and `FormData`
   are reached only inside functions, and the XHR helper checks `typeof XMLHttpRequest ===
   "undefined"` and rejects instead of falling back.
3. **Does a component carry a visual value?** No. The visual-values scan passes. The docs route is
   prose under the reference stylesheet.
4. **Does the commit name a consumer?** No. All three commit messages read. The docs speak of a
   short file and a presigned store, and name no product.
5. **Does any code, comment or test cite a phase, a task, or a planning file?** No. The
   plan-reference scan passes. Two comments cite issue 31 by number, which is the repository's own
   open issue for direct-to-storage multipart. The tracker resolves it, the scan does not match
   it, and the neighbouring comments carry the reason themselves.
6. **Was this review run on the handed hash, in a worktree of its own?** Yes. Detached worktree
   `/home/nryn/work/chaaya-wt/issue11-rev-r1` at the hash above, confirmed with `git log -1`. The
   pins ran there and were reverted.

## Process notes

- The branch sits directly on `main` `ddc87c3`, so landing is a fast-forward after remediation.
- No commit carries a `Chaaya-Task` trailer. Same open owner decision as the kit-by-design branch.
- **Landing order matters.** This branch and the passcode-gate branch both edit `package.json`
  (adjacent export map entries) and the README (adjacent prose bullets and docs lists). Whichever
  lands second needs a rebase, and the rebase must be re-gated before it lands.
- The branch does not change `tools/check.sh`, so the clean-clone triple rule does not re-arm.

## Observations, not findings

- `timeoutMs: 0` means "abort immediately" on the fetch path (`AbortSignal.timeout(0)`) and "no
  timeout" on the XHR path (`xhr.timeout = 0`). A degenerate input, but the two transports
  disagree on it. Document it or refuse 0.
- The XHR abort, timeout, and network-error paths have no test. The wiring reads correctly: a
  pre-aborted signal rejects before `send`, `onabort` rejects with the signal's reason or an
  `AbortError`, and the abort listener is removed on every exit. A FakeXHR test for each path
  would pin them.
- `onProgress` on the fetch path fires only on success, once, with the known size. Documented, and
  the docs say plainly that it is not a progress bar.
- Same-origin XHR always sends cookies, so `credentials: "omit"` cannot strip them there. The
  option docs and `docs/upload.md` both say so. Honest.
- `prepareUpload`, `sendUpload`, `sendUploadWithProgress`, `uploadFailure`, `reportUploadProgress`,
  and `UploadPrepared` are module-level exports that the `./upload` barrel deliberately does not
  re-export. That is unexport by default done right; the future multipart helper is their
  consumer.

## Verdict

**REMEDIATE.** 0 C, 1 H, 0 M, 2 L. The H is the red gate: one type narrowing restores it. The two
L findings are a header passthrough on the synthetic refusal response and a decoder-primitive
deduplication. No verdict on anything outside `main...96cccc0`.
