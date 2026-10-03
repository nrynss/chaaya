# Review: PR #16 — Document domain book and interview events as job progress

**Repo:** `nrynss/chaaya` · **Branch:** `issue-12-domain-progress` → `main` · **Size:** +401 across 5 files
**Verdict: looks good in itself — but do NOT merge before deciding the #17 Step 3 question. Merging publishes the Thutapi adapter as a `job`-module contract, and the cheap fix closes at merge.**

## What the PR does

Maps Thutapi book events (`stage`, `page_approved`, `narration_unavailable`, `book_ready`, `failed`) and interview events (`question`, `question_audio`, `ended`, `error`) onto Keel `job.Progress` frames. `domain.md` is the contract table; `domain.ts` provides pure helper functions returning the frames plus a terminal status. `JobStream` is untouched — the key design move is that since a `done`/`error` frame can't carry a payload, the domain payload rides on the last progress frame's `detail`.

## Strengths

- **The core design is right.** Not forcing payloads onto terminal frames, but parking them on the last progress `detail`, is the clean answer to Keel's constraint — and it's stated in both the code doc and the contract table, with a reload story (last kept `detail`, not a second vocabulary).
- **Dual-counting is handled thoughtfully.** `page_approved` counts pages in `current`/`total` (what the page screen shows) while preserving the stage index in `detail.stage_current`/`stage_total`. That's the kind of nuance that gets lost; here it's documented and tested.
- **Strict input validation.** `payload()` throws on non-integer, negative, zero-total, or `current > total` — pinned by the "page past the book is refused" test. Given these frames feed a UI, failing loudly server-side is correct.
- `eventDetail()` **skips undefined cleanly**, so optional wire fields (`chips`, `filled`, `exchanges`) appear only when present — tested.
- **Good contract doc.** `domain.md` is short, tabular, and states the 8-page / 6-slot Thutapi defaults while keeping the helpers parameterized for callers.

## Findings

1. **URGENT — placement of the Thutapi adapter (#17 Step 3, upgraded from "nit"):** this is the only module in the library coupled to Thutapi rather than Keel, and it is not yet published. #17's deep analysis flags this as the one relocation that is free now and expensive after merge. Decide before merging:
   - keep `domain.ts`/`domain.md` inside `src/lib/job/` and accept that `@nrynss/chaaya/job` publishes Thutapi vocabulary (then #17 Step 0's README wording must say so), **or**
   - rename to make the product explicit (`thutapi.ts`, or a separate `@nrynss/chaaya/domain` subpath), **and/or**
   - make the stage list a parameter (`stages?: readonly string[]` defaulting to today's five).
   The parameter option is the smallest diff and resolves this review's finding 3 at the same time. None of these change behavior; only import paths move.
2. **Inconsistency — optional counts:** `questionAudioReading` makes `checklist` optional (frame omits `current`/`total`), `interviewEndedReading` makes `checklistSize` optional too, but `questionReading` requires it. If the intent is "pass counts when you have them," the interview set should be uniform; if the question's `filled.length` always yields counts, the asymmetry deserves a doc sentence.
3. **Type gap:** `payload()` validates `current`/`total` as `Number.isInteger`, but the public `ProgressPayload` interface types them `number` (not integer). Cosmetic; runtime is guarded.
4. **Hardcoded stage counts:** `stageAt` and the 5-stage order live in code; the contract table in `domain.md` must be updated in lockstep if the pipeline ever grows a stage. (Resolved automatically by finding 1's parameter option.)
5. **Nit — camelCase input vs snake_case detail:** helpers take `imageUrl`/`pdfUrl` but emit `image_url`/`pdf_url`. Deliberate (wire format), but a one-line note in domain.md on the naming flip would save a reader a double take.
6. **Consider:** `bookFailedReading`/`interviewErrorReading` accept a custom `message` but hardcode the `errorCode` (`failed`/`internal`). If a caller ever needs a different code, the helper blocks it; either widen the param or document the fixed code as part of the contract.

## Notes

- All helpers are pure and synchronous — easy to test, and the 134-line test file covers every helper including the validation throw.
- Export block on `job/index.ts` is alphabetized and exports the types — consistent with the rest of the package.
- README "Domain progress" section links the contract — good discoverability.

## Architecture (see #17)

This PR is the centerpiece of the coupling question. It is well-built in isolation — the helpers are strict, the doc is a genuine spec — but it imports Thutapi's product vocabulary (stage names, interview events, `failed`/`internal` codes) into the shared `job` module. #17's analysis distinguishes Keel coupling (structural, keep — `wire` is the adapter) from Thutapi coupling (incidental, movable). This module is the latter, and its merge is the decision point: after merge, moving it is a breaking change; before merge, it is a rename. Recommend resolving #17 Step 3 on this PR before it merges, or merging with the explicit decision recorded that `job` publishes the Thutapi adapter.

## Summary

A well-reasoned contract with disciplined execution: the last-progress-frame payload pattern is the right call, the helpers are strict and tested, and the doc is a genuine spec. The only real question is where it lives — answer #17 Step 3 first, then ship it.
