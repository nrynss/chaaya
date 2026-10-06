# Review: still capture, share intake, priced action

Reviewed hash: `9a9a5076396761aa6acf5906e4b4dacd09210153`.
Worktree: `/home/nryn/work/chaaya-wt/multi-60-62-44-rev-r1` (detached, no commits, no fixes).
This file records one agent's read of the change. It is not a maintainer approval. I did not write this change.

## Scope read

One commit adds three modules plus shared packaging: `src/lib/capture` (camera session, EXIF preparation, backend seam), `src/lib/share` (payload normalisation, launch intake, native seam), `src/lib/priced` (quote, confirm, run once), with export keys in `package.json`, docs pages, test harnesses, Vitest suites, Playwright specs, and `docs/scope.md` plus docs scope route updates. The issues are #60 (still capture), #62 (share intake), and #44 (priced action) with the owner comment on #44. Owner terms for this review: backends swap through a generic seam, share URL falls back from text, currency stays an opaque label with no validation and no arithmetic.

## Verification runs

- `git log -1` in the review worktree confirmed the handed hash before any reading.
- `git diff main...9a9a507` read in full. All 29 files reviewed.
- `npm ci` passed with exit 0.
- `./tools/check.sh` passed in full with exit 0. Chromium, Firefox, and firefox-sink legs passed (235 passed, 3 skipped). The WebKit leg in the pinned container passed. Packaging, publint, published API, published types, server safety, consumer names, and plan reference steps all passed.
- Vitest run by hand: `camera-session.test.ts`, `prepare-image.test.ts`, `share.test.ts`, `priced-action.test.ts`. Result: 4 files, 36 tests, all passed.
- Browser pins rerun by hand on Chromium after the gate released the tree: `still-capture.spec.ts`, `share-intake.spec.ts`, `priced-action.spec.ts`. Result: 9 passed, 0 failed. This covers the generated stream grab with zero live tracks after stop, the EXIF orientation 6 fixture preparing upright with no EXIF segment, share route yielding the payload once and none after reload, text fallback link, double confirm running once, retried request resending one quote id, and keyboard plus gate checks on all three docs pages.
- A first pins attempt failed from my own error. I started it while the gate owned the worktree build, so two concurrent builds collided. I reran cleanly after the gate finished. The failure measured my process, never the change.

## Author notes judged against acceptance

- Chromium applies EXIF orientation even on raw decode requests, so the pin verifies against frame header size. Accepted. `readStoredDimensions` plus `alreadyUpright` in `src/lib/capture/prepare-image.ts` implement exactly that split, and the EXIF browser pin passed.
- Square EXIF images stay ambiguous and the code trusts the request. Accepted as a disclosed limit, recorded below as OUT_OF_SCOPE.
- Docs demo price renders raw amount plus label with no formatting by design. Accepted. No `Intl`, no decimal handling, no code list, and no arithmetic exist anywhere under `src/lib/priced`. This matches the owner term exactly.

## Findings

No actionable findings. Every candidate defect either passed its pin or is routed below.

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| M (OUT_OF_SCOPE, non blocking) | `src/lib/capture/prepare-image.ts`, `alreadyUpright` near line 246 at the reviewed hash | A square still with a swapping EXIF orientation prepares rotated on an engine that honours a raw decode request, because stored and rotated sizes match and the guard trusts the request | Proposed pin, not executed: prepare a square EXIF orientation 6 JPEG through `prepareImage` on an engine that honours `imageOrientation none` and read corner pixels. Chromium cannot serve as the pin because it pre rotates and passes by accident. Owning path: `src/lib/capture/prepare-image.ts` | Delete the `alreadyUpright` branch so the orientation 6 transform runs on every decode, which double rotates on Chromium and fails the existing EXIF pin |

## Review questions

1. Did a Svelte 4 idiom slip in. No. New reactive code uses `$state` only. No `export let`, no `$:` label, no `svelte/store` import in the diff. The gate leakage scan passed.
2. Does a module touch a browser global at import time. No. Camera, canvas, location, and history are reached inside methods only. The gate server safety step passed.
3. Does a component carry a visual value. No. The library change ships classes and functions, no styled components. The visual values guard passed.
4. Does the change, its issue, or its pull request name a consumer. No. The diff names no product, no vendor SDK, and no provider unit. Backend kinds read `session`, `file`, and `native`. Currency appears only as an opaque string. The gate consumer names scan passed.
5. Does any code, comment, or test cite a planning file or a private note, or did stripping one lose the reason. No. Comments state reasons directly. The gate plan reference scan passed.
6. Does `docs/scope.md` still match what the change covers. Yes. Scope gains Still image capture, Share intake, and Priced action sections, and priced actions leave the open issues list. The docs scope route mirrors the same move.
7. Was this review run on the handed hash, in a worktree of its own. Yes. `git log -1` confirmed `9a9a507` in `/home/nryn/work/chaaya-wt/multi-60-62-44-rev-r1`, detached. All runs executed there. Nothing was committed and nothing was fixed.

## Severity counts and verdict

C: 0. H: 0. M: 0. L: 0. OUT_OF_SCOPE observations: 1 (M, non blocking, owning path named above, filed as issue #64).

Verdict: APPROVE. This is round one, so no prior round exists. This round raises zero actionable findings of any severity, hence zero residue.
