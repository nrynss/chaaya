# Review: timeline geometry and edit handles, issue 40, round two

Reviewed hash: `fc7a8a2b2f6dd3e5f98a0dedd4b6d62d414a7cb7`
Worktree: `/home/nryn/work/chaaya-wt/issue-40-rev-r2` (detached at the hash, confirmed with `git log -1`)

This file records one agent's read, not a maintainer approval. I did not write this change and I did not write the round-one review.

## Commit surgery check

`705bce7` was not rewritten. The reviewed hash adds exactly three commits on top: `599f4c2` (refresh on focus), `3175665` (floor minimum at room edge), and `fc7a8a2` (round-one review file). Each fix carries its module and its pin together.

## Gate in this worktree

`npm ci`, then `./tools/check.sh` to a full green `Every check passed`. Vitest 421 tests in 50 files. Playwright on all engines through the house webkit fallback. Port contention with sibling worktrees judged by process evidence, green run owned the port throughout.

## Prior round findings, severity by severity

| Severity | Round-one finding | Disposition |
|---|---|---|
| H | Stale handle announcement after sibling edit. | Fixed, zero residue. `599f4c2` adds one refresh line in `onFocusIn`. My probe (focus move handle, Shift plus ArrowRight, focus start handle, valuetext reads 2.00 seconds) passes. Mutation: delete the line and the probe turns red. |
| M | Resize minimum past span leaves bounds. | Fixed, zero residue. `3175665` floors both clamps at the room edge. My probe (both edges with minLength 10 against bounds 0 to 10 stay inside) passes. Mutation: restore the unfloored clamp and the probe turns red. |

Tracked browser suite: timeline spec 18 passed on chromium plus firefox, including the new sibling announcement test.

## Fresh defect hunt

Whole diff read. No fresh findings, no OUT_OF_SCOPE rows. Closest calls (separator roles with value attributes passing a11yGate, overlong segment needing out of bounds input, review commit touching no module) all clear.

## Seven questions

1. Svelte 4 idiom? No. 2. Browser global at import time? No. 3. Visual value? No. 4. Consumer named? No. 5. Planning reference? No. 6. Scope match? Yes. 7. Handed hash in own worktree? Yes, detached, nothing committed, nothing edited.

## Verdict

APPROVE. C 0, H 0, M 0, L 0. Zero residue against the H and zero against the M, each proven by my own pin run. Gate green on the handed hash.
