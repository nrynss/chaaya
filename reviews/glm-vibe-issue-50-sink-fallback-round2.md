# Review, issue 50, round two

- Reviewed hash: `a7f824eadd2cce995f08a6a9406322a4b20797ae`, confirmed with `git log -1`.
- Base: `origin/main` at `e11e5c7bae32d67896f1b2b2a36035b7e9eb255e`.
- Review worktree: `/home/nryn/work/chaaya-wt/issue-50-rev-r2`, detached, created for this review.
- This file records one agent's read. It is not a maintainer approval.
- I am a fresh agent for round two. I did not write any part of this change, and I differ from
  the round-one reviewer. I fixed nothing and committed nothing.

## Scope of this round

Round one returned REMEDIATE with one L. The L named a false claim in the pull request's
clean-clone table. This round verifies the correction against the recorded logs, re-runs the
load-bearing pins, and returns a verdict.

The change itself is unchanged. `git diff 0350b37..a7f824e` shows only
`reviews/glm-vibe-issue-50-sink-fallback.md`. The code under review is still `0350b37`.

## The round-one L is remediated

The corrected table in the PR description now names both failing tests in rows 4, 5, and 8.
The prose above it says twelve failures across nine runs, with members repeating. I read all
nine author logs under `/tmp/clone-run-1..9.log` and checked every row.

| Run | Table row says | Log shows | Table accurate? |
|---|---|---|---|
| 1 | firefox, audio-stream flush | firefox audio-stream flush, 1 failed | yes |
| 2 | webkit docker leg, audio-capture pcm markers | webkit audio-capture pcm markers, 1 failed, bare leg passed 211 | yes |
| 3 | chromium, audio-capture drained take | chromium audio-capture drained take, 1 failed | yes |
| 4 | firefox, audio-stream flush and audio-support marker order | both, 2 failed | yes |
| 5 | firefox, audio-stream flush and audio-support marker order | both, 2 failed | yes |
| 6 | firefox, audio-stream flush | firefox audio-stream flush, 1 failed | yes |
| 7 | firefox, audio-capture pcm startup | firefox audio-capture PCM startup, 1 failed | yes |
| 8 | firefox, audio-capture pcm startup and audio-support gap | both, 2 failed | yes |
| 9 | firefox, audio-stream flush | firefox audio-stream flush, 1 failed | yes |

The per-run counts sum to twelve. The audio-stream flush test repeats in runs 1, 4, 5, 6, and
9, so members repeat. The prose and the table now match the evidence. Every log also carries
the `{"project":"firefox-sink","worstGap":...}` console mark and no firefox-sink failure, so
the record's claim that the sink leg ran and passed in every attempt holds.

The round-one OUT_OF_SCOPE rows are filed. Issue #52 owns the load-marginal audio-timing
family. Issue #53 owns the sink leg's truncated-transfer race. Both are open.

## Pins I ran

### Must fail

I mutated `media.message.includes(SINK_FAULT)` at
`src/lib/audio/playback/player.svelte.ts:302` to
`media.message.includes("__reviewer_round2_never_matches__")`. Then:

```
npx playwright test --project=firefox-sink tests/playwright/audio-playback.spec.ts
```

Result: 1 failed, 2 skipped, 6 passed (25.0s). The one failure is exactly `a sink error mid
play is an output failure and the element plays on`, dying at its `playing` assertion on line
180. This matches the pull request's measured claim word for word. I reverted the mutation and
confirmed `git status --porcelain` clean. Nothing was committed.

### Must pass

The same command without the mutation: 7 passed, 2 skipped (23.3s). This also matches the pull
request's measured claim.

### Worktree gate path, exercised on a clean clone

My clone 1 below ran the fallback branch end to end. Its message reads `webkit cannot launch on
this host. chromium, firefox, and the sink leg run bare, webkit runs inside
mcr.microsoft.com/playwright:v1.63.0-noble.` The bare leg passed 211 with 3 skipped in 1.6m and
carried the `{"project":"firefox-sink","worstGap":22}` mark. The docker webkit leg passed 96
with 11 skipped in 42.4s. The gate ended with `Every check passed.` The runtime budget holds.

### CI

Run `37259056521` on `0350b37`: success. All four projects ran, firefox-sink included.

Run `37261288161` fired on `a7f824e` when the review file landed. Its first attempt failed on
`[chromium] › tests/playwright/audio-capture.spec.ts:305:3 › a granted microphone › a pcm take
carries the generated markers` with `Error: the take lost the markers at 0.200s`. That test is
a named member of the family issue #52 owns, and the diff does not touch it. I reran the spec
in my worktree at the handed hash and it passed (10 passed, 15.4s). I then reran the failed CI
job with `gh run rerun --failed` and it succeeded. The run's final conclusion is success.

One record note. The PR description says its run on the handed hash passed in 5m29s. That
sentence names run `37259056521` on `0350b37`, the only finished run when the description was
corrected. The review-file commit then moved the branch head, and that head's own run failed
once on a #52 member before my rerun passed it. This paragraph records the full picture, and
the review files ride the branch, so history holds both outcomes.

## Clean-clone record

The protocol asks a gate change to pass three clean clones in a row. That bar is still not met
locally, by anyone. Round one already established why, and this round confirms it. The
pre-existing load-marginal family strikes the bare leg on this workstation regardless of the
change under review. Every failure below sits outside the diff, which is `tools/check.sh` and
a review file only.

```
git clone --branch issue-50-sink-fallback https://github.com/nrynss/chaaya.git /tmp/rev-r2-clone
cd /tmp/rev-r2-clone
npm ci --no-audit --no-fund
./tools/check.sh
```

Clone 1: exit 0. Host load 11 to 15. Full four-project gate, every guard step, `Every check
passed.` Log: `/tmp/rev-r2-clone.log`. This is the first local clean-clone pass in this pull
request's record, and it exercises the clean-checkout risk the rule guards, from `npm ci` on an
empty directory through the built app.

Clone 2, same commands into `/tmp/rev-r2-clone-2`: exit 1. Host load 15 to 21. Two failures in
the bare firefox leg:

- `audio-stream.spec.ts:174` flush. A named member of the family issue #52 owns. It failed
  again on my first rerun at load 17.5 and passed on my second rerun at load 16.
- `audio-upload.spec.ts:225`, `a reloaded page finishes the upload it left behind`. The retries
  counter stayed at `0` through 13 polls of a 5s window after the page went offline. This test
  is not one of #52's named members, so I record it as its own OUT_OF_SCOPE row below. It
  passed on rerun at load 15 (2 passed).

The firefox-sink leg passed inside both clone runs, including the sink-loss pin and the
truncated-transfer test that issue #53 owns. Log: `/tmp/rev-r2-clone-2.log`.

So the local record for this change now reads nine author failures, two round-one failures, and
one pass plus one family-attributed failure from me. The clean-host signal stays with CI, which
passed the identical code tree twice, on `0350b37` and on `a7f824e` after its rerun.

## Findings

No findings in this round.

Severity counts: C 0, H 0, M 0, L 0.

## OUT_OF_SCOPE rows

| Severity | Owning path | What | Pin |
|---|---|---|---|
| M | `tests/playwright/audio-upload.spec.ts:225`, with the retry counter behaviour behind the `retries` probe | The reloaded-page upload test failed once under load in my clone 2. The element held `retries` at `0` for the full 5s assertion window after the page went offline, so the test read a stall where the run was merely slow. The test passed on rerun at load 15. This is a new member outside the family issue #52 names, and the diff does not touch it. | Clone 2, exit 1, error context shows Expected not `0`, Received `0`, 13 polls. Log `/tmp/rev-r2-clone-2.log`. Rerun passed (2 passed, 20.0s). |

This row names its owning path and becomes its own issue. It does not block this verdict.

## The seven questions

1. Did a Svelte 4 idiom slip in? No. The diff touches no Svelte file. The svelte 4 leakage
   guard passed in my clone 1 run.
2. Does a module touch a browser global at import time? No module was added or changed. The
   server safety guard passed in my clone 1 run.
3. Does a component carry a visual value? No component was touched. The visual values guard
   passed in my clone 1 run.
4. Does the change, its issue, or its pull request name a consumer? No. I read the diff, the
   commit messages, the issue, and the pull request. The consumer names guard passed in my
   clone 1 run.
5. Does any code, comment or test cite a planning file or a private note, or did stripping one
   lose the reason it carried? No. The plan references guard passed in my clone 1 run. The new
   comment in `tools/check.sh` states its reason itself. Nothing was stripped here.
6. Does `docs/scope.md` still match what the change covers? Yes. The change alters which
   projects the gate's fallback branch selects. `docs/scope.md` is the library coverage
   contract and says nothing about the gate's browser matrix, so it needs no update.
7. Was this review run on the handed hash, in a worktree of its own? Yes. Detached worktree at
   `a7f824e`, confirmed with `git log -1`. The worktree was clean before my mutation, clean
   after the revert, and stayed clean. My clones ran from fresh checkouts of the branch head.

## Verdict

APPROVE.

Severity counts: C 0, H 0, M 0, L 0.

Zero residue against round one, severity by severity. The round-one L is remediated. I verified
the corrected table and its prose against all nine recorded logs, and they now match. The
round-one pins I re-ran hold. The two round-one OUT_OF_SCOPE rows are filed as issues #52 and
#53, both open. My one new OUT_OF_SCOPE row is recorded above and needs its own issue.

The clean-clone bar of three consecutive passes is not met on this workstation by any reviewer
of this change. The failures all sit in the pre-existing load-marginal family and in one
adjacent upload test, all outside the diff and all filed or recorded above. My clone 1 passed
the full gate from an empty directory, and CI passed the identical code tree on a quiet ubuntu
host on both commits. On that record the change lands.
