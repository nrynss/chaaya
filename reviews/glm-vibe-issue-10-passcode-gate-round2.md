# Review: passcode gate, issue 10, round 2

Written by GLM 5.3 Flash, a coding agent review. This file rides the branch and records one
model's read. It is not a maintainer approval.

- Hash reviewed: `e79ee11a298d989258cab77fd5ee7322514548d0` (branch `issue-10-passcode`, the
  remediation commit on top of round 1's review commit `f2e9df1`)
- Worktree: `/home/nryn/work/chaaya-wt/issue10-rev-r2` (detached at the hash)
- Round 1 file: `reviews/glm-vibe-issue-10-passcode-gate.md`, verdict REMEDIATE, 1 L

## Round-1 findings, one round later

| Finding | Verdict | Evidence |
| --- | --- | --- |
| L: the `readSetCookie` comment and `docs/auth.md` claim browsers lack `getSetCookie` | Fixed. | Both the code comment and the docs paragraph, plus the route page and the `remember()` comment, now state the real mechanism: browsers implement `getSetCookie`, and a fetch response returns `[]` because `Set-Cookie` is a forbidden response-header name. The hidden-cookie test fake now carries `getSetCookie() { return [] }`, so the pin matches current browsers. |

The commit also carries the round-1 observations: `keelGate` documents and pins that an empty
name falls back to the Keel default while `GatePasscode` throws, and `remember()` documents and
pins that a `Set-Cookie` line wins over a body `passcode` when both exist. Both are correct.

## New finding this round

| Severity | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| L | `src/lib/auth/gate.ts`, `readCookie` (lines 64 to 69 at the reviewed hash). | The new `unquoteCookie` runs after `decodeURIComponent`, so the library's own write-read round trip mangles a passcode that contains quote characters. `set('"abc"')` writes `app_gate=%22abc%22` into the jar, and `value` then reads `abc`: decode first turns `%22abc%22` into `"abc"`, and unquoting strips quotes that are data, not quoting. Unquoting the raw value before decoding is strictly more correct, because a raw value that begins with a literal quote is a quoted-string, and percent-encoded quotes are data. A passcode that begins and ends with a double quote is unlikely, which is why this is an L. | A temporary pin test written, run, and deleted in this worktree: `readCookie('app_gate=%22abc%22', 'app_gate')` must be `'"abc"'`. The committed code returns `'abc'` and fails the pin. | Unquote the raw value first, then decode: `const bare = unquoteCookie(raw)`, then `decodeURIComponent(bare)` in the try and `return bare` in the catch. The pin passes and all 11 existing gate tests stay green with that order (measured in this worktree, then reverted). |

## What the gate measured in this worktree

`npm ci`, then `./tools/check.sh`. svelte-check, eslint, the Svelte 4 leakage scan, the visual
values scan, the Keel fixture byte diff, and vitest (224 tests, 31 files) all passed. The
Playwright leg failed one test: `[firefox] tests/playwright/audio-upload.spec.ts:141 a take
streams in chunks through a brief network drop and arrives whole`, with the retries counter at 0.
191 other tests passed. Re-run alone: passed (exit 0). The branch touches no audio module, no
test, and no route the test visits. I read it as the workstation flake that round 1 also saw on
this suite.

Because the gate stops at Playwright, the remaining steps ran by hand in this worktree:
svelte-package, publint, the published-api check (deferred), the published-types probe, the
server-safety import of every key, the consumer-name scan, and the plan-reference scan. All
passed.

## Residue claim

The round-1 L is fixed. One new L exists this round, introduced by the unquoting fix. Severity by
severity: 0 C, 0 H, 0 M, 1 L (new).

## Verdict

**REMEDIATE.** 0 C, 0 H, 0 M, 1 L. The fix is the two-line reorder inside `readCookie` plus the
pin. No verdict on anything outside `main...e79ee11`.
