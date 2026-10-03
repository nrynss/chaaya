# Review: one-shot upload, issue 11, round 2

Written by GLM 5.3 Flash, a coding agent review. This file rides the branch and records one
model's read. It is not a maintainer approval.

- Hash reviewed: `065aa95e20367c7d3cc1c28286ed221533eedc60` (branch `issue-11-oneshot-upload`,
  the remediation commit on top of round 1's review commit `90ee7b4`)
- Worktree: `/home/nryn/work/chaaya-wt/issue11-rev-r2` (detached at the hash)
- Round 1 file: `reviews/glm-vibe-issue-11-oneshot-upload.md`, verdict REMEDIATE, 1 H, 2 L

## Round-1 findings, one round later

| Finding | Verdict | Evidence |
| --- | --- | --- |
| H: `UploadPrepared.payload` is `BodyInit`, so svelte-check fails on `xhr.send` and the gate dies at step one | Fixed. | `payload` is now `FormData \| Blob` in the interface and in `prepareUpload`, which are the only shapes it builds. The full gate reaches Playwright in this worktree, so svelte-check passes. The published-types probe still typechecks the packed package. |
| L: the XHR path's `parseError` receives a synthetic Response with no headers | Fixed. | `uploadFailure` now takes the `Headers` the transport saw, and the XHR path builds them from `getAllResponseHeaders()` via `xhrHeaders`. The new test pins it: a parser reads `retry-after: 7` and `x-request-id: req-1` off the XHR refusal, and `retryAfterSeconds` is still 7. |
| L: `detailObject`, `decodeBody`, `readRetryAfter` are private copies | Fixed. | The three locals are gone; `upload-blob.ts` imports them from `core/api.ts`, which now exports them for this sharing. They are not re-exported from the core barrel, so the package surface is unchanged. |

The commit also refuses `timeoutMs: 0` on both transports through one `positiveTimeout` guard
(`RangeError`, pinned by a test that asserts neither transport opens), which was a round-1
observation, and adds the missing FakeXHR coverage for the abort, timeout, and network-error
paths: a pre-aborted signal rejects with the caller's reason and never sends, a mid-flight abort
rejects with its reason, and the timeout and network codes surface as before. All of that matches
the round-1 reading of the wiring.

## What the gate measured in this worktree

`npm ci`, then `./tools/check.sh`. svelte-check, eslint, the Svelte 4 leakage scan, the visual
values scan, the Keel fixture byte diff, and vitest (227 tests, 30 files, including the four new
upload tests) all passed. The Playwright leg failed one test: `[webkit]
tests/playwright/audio-capture.spec.ts:305 a pcm take carries the generated markers`, with "the
take lost the markers at 0.100s" — a different slot than round 1's 0.300s, same flaky leg. 89
other webkit lines passed. Re-run alone through the gate's own Docker fallback: passed (exit 0).
The branch touches no audio module and no test.

Because the gate stops at Playwright, the remaining steps ran by hand in this worktree:
svelte-package, publint, the published-api check (deferred), the published-types probe, the
server-safety import of every key, the consumer-name scan, and the plan-reference scan. All
passed.

## Residue claim

Zero findings remain from round 1, severity by severity: the H is fixed at the gate, and both Ls
are fixed with tests. No new findings this round.

## Verdict

**APPROVE.** 0 C, 0 H, 0 M, 0 L. No verdict on anything outside `main...065aa95`.
