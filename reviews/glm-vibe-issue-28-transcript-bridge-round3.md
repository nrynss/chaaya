# Review: the transcript-to-SSE word bridge, issue 28, third round

- Reviewed hash: `701af7a`, the remediation commit on the rebased branch, on `main` `6893c57`
- Worktree: `/home/nryn/work/chaaya-wt/issue-28-rev-r3`, detached, confirmed with `git log -1`
- Reviewer: glm, third round on this branch
- Round-2 file: `reviews/glm-vibe-issue-28-transcript-bridge-round[2].md` at `5f040e9`

## Rebase integrity

`git range-diff` over the round-2 state against this head reports `=` on all six carried commits, with the remediation as the only new one. Nothing reviewed changed during the rebase.

## Round-2 findings, one round later

- **H, the test fields trip the plan-reference scan**, fixed. The custom-parse test now names its fields `tStart` and `tEnd`. A `t` followed by a letter does not match the scan's identifier branch, and the plan-references step, run by the gate's own code on this tree, is clean. All four scans are clean.
- One more correction, mine. The remediation also reworded my round-2 file, because that file spelled the two field names literally in its finding row. The plan-reference scan reads every tracked file, my own file included, and my round-2 file would have blocked the same step it reported. The reworded row says the same thing without the literal.

## What else the remediation carries, reviewed as new work

- The wiring fence now passes the stream url, `createEventStream("/transcript/events", { ... })`, and declares `editor` before the callback assigns it. The round-1 fence called the function without its url argument and referenced an undeclared binding, so it did not typecheck for a copy-paster. That defect rode through my first two rounds: I verified the docs' behavioural claims but never typechecked this fence, which is the same gap that let the recording-session fence through. The route's example string carries the same fix.
- The parser-failure test is now seeded. It applies a word first, then a null return, then a throw, and asserts the list still holds one word after each. The old version asserted an empty list stayed empty, which proved nothing about clearing despite the test's name. The new version measures what the name says. All 12 bridge tests pass on this tree.

## Residue claim, severity by severity

Round 1 carried one H, fixed in round 2 and still fixed here. Round 2 carried one H, fixed above. There is no residue from either round.

## Gate

One solo run on a clean install: exit 1 at playwright with 191 passed and one failure, the firefox flush leg already recorded as out of scope in round 2, with the cross-tree matrix that shows main failing it too. The owner has accepted that row as host-speed on main.

Because the leg blocked the tail, I ran the gate's own code for everything after playwright by hand on this tree: svelte-package, publint, the published api check at version 0.3.0, the packed-tarball import and typecheck probe, server safety, consumer names, and plan references. The chain ran to `Every check passed.` Combined with the gate run, every step of the gate has now passed on this tree except the one accepted audio leg.

## The six questions

1. Svelte 4 idiom: none.
2. Browser global at import time: none.
3. Visual value: none.
4. Consumer names: none. The scan is clean.
5. Plan citations: none. The scan is clean, and my own round-2 file no longer trips it.
6. Hash and worktree: yes. A detached worktree of its own at the handed hash.

## Verdict

APPROVE, with zero findings of this branch's own. The out-of-scope audio row from round 2 stands, owned on main, and never blocks.
