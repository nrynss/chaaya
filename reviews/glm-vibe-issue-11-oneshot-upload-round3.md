# Review: one-shot upload, issue 11, round 3

Written by GLM 5.3 Flash, a coding agent review. This file rides the branch and records one
model's read. It is not a maintainer approval.

- Hash reviewed: `6ea6e4ee51faf1d2e9a39f0456d2d734e9974d54` (branch `issue-11-oneshot-upload`,
  the follow-up remediation on top of the carried round-2 review file)
- Worktree: `/home/nryn/work/chaaya-wt/issue11-rev-r3` (detached at the hash)
- Round 2 file: `reviews/glm-vibe-issue-11-oneshot-upload-round2.md`, verdict APPROVE with zero
  findings. This round reviews the additional commit that answers another reviewer's finding.

## Branch shape since round 2

The branch was rebased onto `main` `fdbbb63`, which carries the merged topic-SSE work. The
reviewed content is unchanged: diffing the round-2 hash `065aa95` against the rebased `c7ac2a5`
on the upload sources, tests, barrel, docs, route, and `package.json` is empty, so the round-2
APPROVE carries over byte for byte. The only new content is the commit under review.

## The new commit

Another reviewer's finding: with `maxBytes` set, a `size` that is `NaN`, negative, or infinite
failed both limit comparisons (`NaN > limit` is false) and the body was sent, past a limit the
caller named. The commit refuses such a size before the comparison:

- The guard sits after the `UploadSizeUnknown` check and before the `UploadTooLarge` comparison,
  gated on `maxBytes` being set, which matches the documented role of `size` (it exists for the
  limit check).
- `Number.isFinite` and `known < 0` cover `NaN`, both infinities, and negatives. Zero stays a
  valid length, which is correct for an empty body under a limit.
- The `RangeError` leaves through `begin()`, so both entry points reject instead of throwing, and
  the test asserts neither transport opened.
- The test sweeps `NaN`, `-1`, and `+Infinity` across `uploadBlob` and
  `uploadBlobWithProgress`, and asserts the message names the fix.

Mutation check in this worktree: removing the three-line guard fails exactly that test (13 other
upload tests stay green), and the tree was restored afterwards.

One observation, not a finding: a nonsense `size` without `maxBytes` still flows into progress
reporting, because `prepared.size` feeds `onProgress` on the fetch path. That behaviour predates
this commit and matches the docs, which give `size` no role beyond the limit check. If the
progress path ever grows its own limit, the validation moves with it.

## What the gate measured in this worktree

`npm ci`, then `./tools/check.sh`. Exit 0, every step green in one pass: svelte-check, eslint,
the Svelte 4 leakage scan, the visual values scan, the Keel fixture byte diff, vitest (237
tests, 31 files, the branch carrying the merged topic-SSE suite plus the new size test), the
full Playwright leg across all three engines (192 on chromium and firefox bare, 90 on webkit in
the pinned image), svelte-package, publint, the published-api check (deferred), the
published-types probe, the server-safety import, the consumer-name scan, and the plan-reference
scan.

## Residue claim

Zero findings remain from rounds 1, 2, and 3, severity by severity. No new findings this round.

## Verdict

**APPROVE.** 0 C, 0 H, 0 M, 0 L. No verdict on anything outside `main...6ea6e4e`.
