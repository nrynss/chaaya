# Review: the headless recording session, issue 27, second round

- Reviewed hash: `f7ddfc7`, the remediation commit on the rebased branch. Base `59c5c7c`, the merge-base with `main` at rebase time.
- Worktree: `/home/nryn/work/chaaya-wt/issue-27-rev-r2`, detached, confirmed with `git log -1`
- Reviewer: glm, second round on this branch
- Round-1 file: `reviews/glm-vibe-issue-27-recording-session.md` at `3b3b937`

## Rebase integrity

`git range-diff 50246f4..d1751a5 6893c57..4ec571f` reports `=` on both reviewed commits. The patches this branch carried into round 1 are byte-identical through the rebase, so the remediation is the only new code.

## Round-1 findings, one round later

- **H, svelte-check rejects two comparisons**, fixed. Both sites now read the phase through `storedPhase()`, a function whose body the checker cannot narrow, so the comparison is type-true again. The runtime value is the same binding, so behaviour is unchanged, and the comment names why the indirection exists. svelte-check passed in all three gate runs below.
- **M, the wiring fence does not typecheck**, fixed. Both copies, the doc fence and the route's example string, now await `uploadBlob` in a block body. I re-ran the strict tsc probe from round 1 against the new shape: assignable.
- **Note, the double `uploading` publish**, addressed. `docs/recording-session.md` now says a listener can see `uploading` twice and what the second call carries.

## A correction to round 1

The round-1 file says: I ran the consumer-name and plan-reference scans over the tracked tree by hand, and they were clean. That claim was false. The scan command I ran by hand was bash syntax executed under zsh, the loop inside it never ran, and the clean verdict printed unconditionally. The scan would have caught the finding below at round 1. The gate run on this tree caught it instead. I record the correction here because the round-1 verdict rested on that evidence.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| H | `docs/recording-session.md:3`, present since the round-1 content commit | The doc names a consumer in a tracked file. Line 3 says the controller does not know Keel or a consumer name this repository scans for. The consumer-name scan is case-insensitive over every tracked file and fails the gate on it. I quote it without the name, because the scan reads this file too. | The gate's own scan step, run on this tree, lists that file and exits 1. `git grep -i` for the name returns exactly that line. | Delete the name from the sentence and the scan passes. Re-add it and the gate blocks again. |
| OUT_OF_SCOPE, L | `tests/playwright/audio-stream.spec.ts:174` and the sibling audio specs, owned on `main` | The generated-signal audio legs are host-speed-sensitive and failed intermittently today on this tree and on bare `main` alike, a different set each run. See the gate matrix below. Nothing in this branch touches playback. | The isolation runs: the flush test failed 4 of 5 attempts on this tree and 1 of 3 on a bare `main` worktree, the same assertion each time. | Restore any of the failed legs to green by load alone and the matrix stops reproducing. |

## Gate

Three full runs on a clean install, in order:

1. Exit 1 at playwright, 191 passed, one failure: the firefox flush test, `audio-stream.spec.ts:174`.
2. Exit 1 at playwright, 191 passed, the same firefox flush test again, solo.
3. Exit 1 at playwright, 187 passed, four failures across `audio-support` and `audio-capture` on chromium and firefox.

Every step before playwright passed in all three runs, including svelte-check with the fix. The isolation matrix above shows the same legs failing on a bare `main` worktree today, after they passed solo yesterday. The failures move between tests and trees while the branch carries no playback change, which is the machine, not this diff.

Because playwright blocked the tail steps, I ran the gate's own code for everything after it by hand on this tree: svelte-package, publint, the published api check at version 0.3.0, the packed-tarball import and typecheck probe, and server safety. All green. The consumer-names step is the blocked one in the finding above. The plan-references scan, run by hand with the gate's pattern, is clean.

## The six questions

1. Svelte 4 idiom: none in the remediation. The `storedPhase()` helper is a plain function.
2. Browser global at import time: none. The remediation touches a closure and two docs.
3. Visual value: none.
4. Consumer names: one, the finding above.
5. Plan citations: none. The plan-references scan is clean on this tree.
6. Hash and worktree: yes. A detached worktree of its own at the handed hash.

## Verdict

REMEDIATE, with one H of this branch's own: the consumer name in the recording-session doc. It is a one-word fix in one sentence, and it existed at round 1, where my own broken scan hid it. Everything round 1 asked for is fixed and verified.
