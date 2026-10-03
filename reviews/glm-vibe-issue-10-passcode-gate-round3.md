# Review: passcode gate, issue 10, round 3

Written by GLM 5.3 Flash, a coding agent review. This file rides the branch and records one
model's read. It is not a maintainer approval.

- Hash reviewed: `4a1bcbba41c38638e2b12513a66999e79210416e` (branch `issue-10-passcode`, the
  round-2 remediation on top of the carried round-2 review file)
- Worktree: `/home/nryn/work/chaaya-wt/issue10-rev-r3` (detached at the hash)
- Round 2 review: commit `f0fe501` (the round 2 carry), verdict REMEDIATE with one
  new L (the unquoting order in `readCookie`)

## Branch shape since round 2

The branch was rebased onto `main` `fdbbb63`, which carries the merged topic-SSE work. The
reviewed content is unchanged: diffing the round-2 hash `e79ee11` against the rebased `608fe39`
on `src/lib/auth`, the Keel gate files, `docs/auth.md`, and the auth route is empty, so the
round-2 verdict carries over byte for byte. The only new content is the remediation commit.

## Round-2 finding, one round later

| Finding | Verdict | Evidence |
| --- | --- | --- |
| L: `readCookie` unquotes after decoding, so `set('"abc"')` round-trips as `abc` | Fixed. | `readCookie` now runs `unquoteCookie` on the raw value and decodes the bare result, exactly the order the round-2 mutation measured. A regression test pins both sides: `set('"abc"')` through the jar reads back `'"abc"'`, the direct header `app_gate=%22abc%22` reads `'"abc"'`, and a fresh helper's `value` returns `'"abc"'`. The literal quoted-string case (`app_gate="open-sesame"` reads `open-sesame`) stays covered by the Set-Cookie test. The commit touches only `gate.ts` and its test. |

The round-2 pin, re-run as a temporary test in this worktree, passes on the committed code. All
9 core gate tests and 2 Keel gate tests stay green.

## What the gate measured in this worktree

`npm ci`, then `./tools/check.sh`. svelte-check, eslint, the Svelte 4 leakage scan, the visual
values scan, the Keel fixture byte diff, and vitest (234 tests, 32 files, the branch carrying the
merged topic-SSE suite plus the new round-trip test) all passed. The Playwright leg failed one
test: `[firefox] tests/playwright/audio-stream.spec.ts:174 a flush stops the audio within one
block` — the same leg that has flaked in both earlier rounds, on a branch that touches no audio
module, no test, and no route the test visits. Re-run alone: passed (exit 0).

Because the gate stops at Playwright, the remaining steps ran by hand in this worktree:
svelte-package, publint, the published-api check (deferred), the published-types probe, the
server-safety import of every key, the consumer-name scan, and the plan-reference scan. All
passed.

## Residue claim

Zero findings remain from rounds 1 and 2, severity by severity. No new findings this round.

## Verdict

**APPROVE.** 0 C, 0 H, 0 M, 0 L. No verdict on anything outside `main...4a1bcbb`.
