# Review: PR #16 — Document domain book and interview events as job progress

**Repo:** `nrynss/chaaya` · **Branch:** `issue-12-domain-progress` → `main` · **Size:** +401 across 5 files
**Verdict: looks good — no blocking issues.**

## What the PR does

Maps Thutapi book events (`stage`, `page_approved`, `narration_unavailable`, `book_ready`, `failed`) and interview events (`question`, `question_audio`, `ended`, `error`) onto Keel `job.Progress` frames. `domain.md` is the contract table; `domain.ts` provides pure helper functions returning the frames plus a terminal status. `JobStream` is untouched — the key design move is that since a `done`/`error` frame can't carry a payload, the domain payload rides on the last progress frame's `detail`.

## Strengths

- **The core design is right.** Not forcing payloads onto terminal frames, but parking them on the last progress `detail`, is the clean answer to Keel's constraint — and it's stated in both the code doc and the contract table, with a reload story (last kept `detail`, not a second vocabulary).
- **Dual-counting is handled thoughtfully.** `page_approved` counts pages in `current`/`total` (what the page screen shows) while preserving the stage index in `detail.stage_current`/`stage_total`. That's the kind of nuance that gets lost; here it's documented and tested.
- **Strict input validation.** `payload()` throws on non-integer, negative, zero-total, or `current > total` — pinned by the "page past the book is refused" test. Given these frames feed a UI, failing loudly server-side is correct.
- `eventDetail()` **skips undefined cleanly**, so optional wire fields (`chips`, `filled`, `exchanges`) appear only when present — tested.
- **Good contract doc.** `domain.md` is short, tabular, and states the 8-page / 6-slot Thutapi defaults while keeping the helpers parameterized for callers.

## Findings (all minor)

1. **Inconsistency — optional counts:** `questionAudioReading` makes `checklist` optional (frame omits `current`/`total`), `interviewEndedReading` makes `checklistSize` optional too, but `questionReading` requires it. If the intent is "pass counts when you have them," the interview set should be uniform; if the question's `filled.length` always yields counts, the asymmetry deserves a doc sentence.
2. **Type gap:** `payload()` validates `current`/`total` as `Number.isInteger`, but the public `ProgressPayload` interface types them `number` (not integer). Cosmetic; runtime is guarded.
3. **Hardcoded stage counts:** `stageAt` and the 5-stage order live in code; the contract table in `domain.md` must be updated in lockstep if the pipeline ever grows a stage. Consider deriving the doc numbers from `bookStages` in a comment or test that asserts the table's 3/5, 2/5 values (the tests do pin 3-of-5 and 2-of-5, which helps).
4. **Nit — camelCase input vs snake_case detail:** helpers take `imageUrl`/`pdfUrl` but emit `image_url`/`pdf_url`. Deliberate (wire format), but a one-line note in domain.md on the naming flip would save a reader a double take.
5. **Consider:** `bookFailedReading`/`interviewErrorReading` accept a custom `message` but hardcode the `errorCode` (`failed`/`internal`). If a caller ever needs a different code, the helper blocks it; either widen the param or document the fixed code as part of the contract.

## Notes

- All helpers are pure and synchronous — easy to test, and the 134-line test file covers every helper including the validation throw.
- Export block on `job/index.ts` is alphabetized and exports the types — consistent with the rest of the package.
- README "Domain progress" section links the contract — good discoverability.

## Summary

A well-reasoned contract with disciplined execution: the last-progress-frame payload pattern is the right call, the helpers are strict and tested, and the doc is a genuine spec. Findings are uniformity and doc nits. Ship it.
