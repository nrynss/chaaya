# Review: issue 64, square EXIF guard

Reviewed hash: `8cd02ab`.
Worktree: `/home/nryn/work/chaaya-wt/issue-64-rev-r1` (detached HEAD, confirmed with `git log -1`).
This file records one agent's read, not a maintainer approval. I did not write this change. I committed nothing and fixed nothing.

## Scope read

Four files, one commit, one issue, no new export key. Guard fix plus decodeEvidence classifier in prepare-image.ts, three unit pins, shared EXIF fixture builder plus two square harness paths, two square browser pins.

## Gate and pins run

Full gate green in my own worktree: svelte-check 0 errors 0 warnings, eslint clean, leakage and visual scans clean, Keel fixtures pass, vitest 50 files 424 tests pass, Playwright leg green after clearing a stale server that was my own leftover. Cited pins green: prepare-image.test.ts 9 tests, still-capture.spec.ts 10 of 10 on chromium plus firefox including both square pins. Packaging, publint, published-api, packed-tarball probe, server-safety, consumer and plan scans all pass. WebKit not run locally (host cannot launch it, container fallback not exercised here, CI covers it). Both square pins are engine-agnostic pixel assertions.

## Failing-before verification

Scratch worktree with only prepare-image.ts reverted to main: simulated-raw square pin failed exactly as predicted while real-engine square pin passed by accident. With the fix both pass. The simulated pin measures the guard logic, and the real-engine pin guards no double rotation.

## Findings

No findings. Double rotation, samePixels validity, bitmap close handling, and harness wrapper mechanics all checked clean. OUT_OF_SCOPE rows: none.

## Seven questions

1. Svelte 4 idiom? No. 2. Browser global at import time? No, all through globalThis inside functions. 3. Visual value? No, fills are harness pixel content. 4. Consumer named? No. 5. Planning reference? No. 6. Scope match? Yes, square handling stays inside described behaviour. 7. Handed hash in own worktree? Yes.

## Verdict

Severity counts: C 0, H 0, M 0, L 0. Round one, no prior rounds.

APPROVE with zero residue.
