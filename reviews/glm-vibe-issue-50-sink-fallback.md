# Review, issue 50, round one

- Reviewed hash: `0350b37eba1ad6b2891cc46807bcea234f7122f2`, confirmed with `git log -1`.
- Base: `origin/main` at `e11e5c7bae32d67896f1b2b2a36035b7e9eb255e`.
- Review worktree: `/home/nryn/work/chaaya-wt/issue-50-rev-r1`, detached, created for this review.
- This file records one agent's read. It is not a maintainer approval.

## The change

The webkit fallback branch in `tools/check.sh` names `firefox-sink` beside `chromium` and
`firefox` in the bare leg. The comment above the step and the fallback message say the same.
The launching path is untouched. One commit, one file, 5 insertions, 3 deletions.

I read `git diff origin/main...0350b37` against issue 50. The diff does what the issue asks
and nothing else. The comment and the message describe the new behaviour accurately.

## Pins I ran

### Must fail

I applied the pull request's mutation myself in the review worktree. I changed
`media.message.includes(SINK_FAULT)` at `src/lib/audio/playback/player.svelte.ts:302` to
`media.message.includes("__reviewer_mutation_never_matches__")`. Then:

```
npx playwright test --project=firefox-sink tests/playwright/audio-playback.spec.ts
```

Result: 1 failed, 2 skipped, 6 passed (26.2s). The one failure is exactly `a sink error mid
play is an output failure and the element plays on`. With the output branch unreachable, the
classify path clears `playing`, so the test dies at its `playing` assertion. This is the
mutation's own doing. I reverted the mutation and confirmed the worktree clean with
`git status --porcelain`. Nothing was committed.

### Must pass

The same command without the mutation: 7 passed, 2 skipped (19.4s). The two skips are the
chromium-only decode test and the stub test that the live sink latches first.

### Worktree gate

`npm ci`, then `./tools/check.sh`. Exit 0. The fallback branch ran. Its message reads
`webkit cannot launch on this host. chromium, firefox, and the sink leg run bare, webkit runs
inside mcr.microsoft.com/playwright:v1.63.0-noble.` The bare leg passed 211 with 3 skipped in
2.0m, and the firefox-sink console mark `{"project":"firefox-sink","worstGap":32}` is in the
log, so the sink-loss pin ran and passed. The docker webkit leg passed 96 with 11 skipped in
47.8s. The gate ended with `Every check passed.` Log: `/tmp/rev-r1-worktree-gate.log`.

### CI

Run `37259056521` on head `0350b37`, branch `issue-50-sink-fallback`: success in 5m29s. The
job log shows all four projects ran, including firefox-sink with the sink-loss pin's console
mark. CI is the only host that is not this workstation. On ubuntu webkit launches, so the run
exercised the plain launching path and the sink leg on a quiet host.

### Clean clones

The protocol asks a gate change to pass three clean clones in a row. **That bar was not met
locally, by the author or by me. The signal is carried by the CI run instead.** My own runs
below reproduce the author's picture. Every failure sits in the pre-existing load-marginal
audio-timing family or in one test of the same shape inside the firefox-sink leg. None touches
the diff, which is `tools/check.sh` only. The change adds no build or import surface, so the
clean-checkout risk the clone rule guards is not reachable from this diff.

The author's nine logs exist at `/tmp/clone-run-1.log` through `/tmp/clone-run-9.log`. I read
all nine. Corroboration, run by run:

| Run | Table row says | Log shows | Table accurate? |
|---|---|---|---|
| 1 | firefox, audio-stream flush | firefox audio-stream flush, 1 failed | yes |
| 2 | webkit (docker leg), audio-capture pcm markers | webkit audio-capture pcm markers, 1 failed, bare leg passed | yes |
| 3 | chromium, audio-capture drained take | chromium audio-capture drained take, 1 failed | yes |
| 4 | firefox, audio-support marker order | firefox audio-support marker order AND firefox audio-stream flush, 2 failed | no, one of two named |
| 5 | firefox, audio-support marker order | firefox audio-support marker order AND firefox audio-stream flush, 2 failed | no, one of two named |
| 6 | firefox, audio-stream flush | firefox audio-stream flush, 1 failed | yes |
| 7 | firefox, audio-capture pcm startup | firefox audio-capture PCM startup, 1 failed | yes |
| 8 | firefox, audio-support gap | firefox audio-support gap AND firefox audio-capture PCM startup, 2 failed | no, one of two named |
| 9 | firefox, audio-stream flush | firefox audio-stream flush, 1 failed | yes |

Every one of the nine logs carries the firefox-sink console mark, so the sink leg ran and
passed in every attempt. This part of the record is true.

My own clones, each from origin with its own checkout and install:

```
git clone --branch issue-50-sink-fallback https://github.com/nrynss/chaaya.git /tmp/rev-r1-clone-1
cd /tmp/rev-r1-clone-1 && npm ci --no-audit --no-fund && ./tools/check.sh
```

Clone 1: exit 1. Three failures: chromium `audio-capture` pcm markers, firefox `audio-capture`
PCM startup, firefox `audio-support` gap. The firefox-sink leg passed 7 of 7 inside the same
failing run. Reruns of the two failing specs at load 11 to 14: `audio-capture` on chromium and
firefox, 20 passed. `audio-support` on firefox, 4 passed. Flake confirmed. Log:
`/tmp/rev-r1-clone-1.log`.

Clone 2, same commands into `/tmp/rev-r1-clone-2`: exit 1. Two failures: firefox
`audio-stream` flush, and firefox-sink `a connection that dies mid play is a network failure
and stops the player` at `tests/playwright/audio-playback.spec.ts:194`. The second failure is
in the leg this change adds to the fallback. The captured error context shows Expected
`network`, Received `decode`. The transfer must die mid play before the decoder consumes the
truncated tail, and under load the race tipped. Rerun of the single test at load 9.7: passed.
Rerun of the full firefox-sink leg at load 10: 7 passed, 2 skipped. Flake confirmed. Log:
`/tmp/rev-r1-clone-2.log`.

Host load was 15 to 22 during my gate runs and 9 to 10 at the reruns that passed. The author
reports 9 to 13. I could not verify their load readings from the logs. The attribution does
not rest on them. The author's isolation record on a detached worktree at the base commit is
in the PR 49 description, which I read. It records the same family failing with none of this
change in the tree.

So, plainly: the three-consecutive-passes bar was not met locally. Twelve failures across the
author's nine runs and three across my two runs all sit in the pre-existing family. CI run
`37259056521` passed the full four-project gate on a quiet ubuntu host. That run is the
clean-host signal this change is judged on.

## Findings

| # | Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|---|
| 1 | L | PR #51 description, `Clean-clone record` table rows 4, 5, 8, and the paragraph above the table | The record misdescribes the runs it cites. Rows 4, 5, 8 each name one failing test, and each log shows two. Twelve failures occurred across the nine runs, not `all nine`. Members repeat, runs 1, 4, 5, 6 and 9 all lost the audio-stream flush test, so `a different member each run` is false. The corrected record still supports the author's conclusion, and a fuller table makes it stronger. | `/tmp/clone-run-4.log`, `/tmp/clone-run-5.log`, `/tmp/clone-run-8.log`. Each ends its bare leg with `2 failed` and names both tests. | The rows as written are the reintroduction. Naming the second test in rows 4, 5, 8 and correcting the prose count to twelve removes the false claim. |

Severity counts: C 0, H 0, M 0, L 1.

No finding in this review is recorded as a false positive.

## OUT_OF_SCOPE rows

| Severity | Owning path | What | Pin |
|---|---|---|---|
| M | `tests/playwright/audio-stream.spec.ts`, `tests/playwright/audio-support.spec.ts`, `tests/playwright/audio-capture.spec.ts` | These specs fail intermittently under background load, including on clean clones of `origin/main` (recorded in the PR 49 description). They are why the three-clone bar cannot be met on this workstation today. This change does not own them. | My clone 1 run, exit 1, three failures in these specs, all pass on rerun at load 11 to 14. Log `/tmp/rev-r1-clone-1.log`. |
| M | `tests/playwright/audio-playback.spec.ts`, the truncated-transfer test at line 194 and the fixture route behind `trunc.wav` | The firefox-sink leg carries a load-marginal race of the same shape. The transfer must die mid play before the decoder consumes the truncated tail. Under load it classified as `decode` instead of `network`. This change widens where the leg runs, so fallback workstations now meet the race. The defect is in the test's race, not in the project selection this change makes. | My clone 2 run, exit 1, error context shows Expected `network`, Received `decode`. The single test and the full leg passed on rerun twice. Log `/tmp/rev-r1-clone-2.log`. |

Each row names the path that owns it and becomes its own issue. Neither blocks an APPROVE.
There is no APPROVE in this round, so both rows must be filed regardless of the verdict.

## The seven questions

1. Did a Svelte 4 idiom slip in? No. The diff touches no Svelte file. The svelte 4 leakage
   guard passed in my gate run.
2. Does a module touch a browser global at import time? No module was added or changed. The
   server safety guard passed in my gate run.
3. Does a component carry a visual value? No component was touched. The visual values guard
   passed in my gate run.
4. Does the change, its issue, or its pull request name a consumer? No. I read the diff, the
   commit message, the issue, and the pull request. The consumer names scan passed in my gate
   run.
5. Does any code, comment or test cite a planning file or a private note, or did stripping one
   lose the reason it carried? No. The plan references scan passed in my gate run. Nothing was
   stripped in this change, so no reason was lost.
6. Does `docs/scope.md` still match what the change covers? Yes. The change alters which
   projects the gate's fallback branch selects. `docs/scope.md` is the library coverage
   contract and needs no update.
7. Was this review run on the handed hash, in a worktree of its own? Yes. Detached worktree at
   `0350b37`, confirmed with `git log -1`. The worktree was clean before and after my reverted
   mutation. I committed nothing anywhere.

## Verdict

REMEDIATE.

Severity counts: C 0, H 0, M 0, L 1. There are no prior rounds on this issue, so there is no
residue against earlier rounds to claim.

The code commit is not implicated. The finding is a false claim in the pull request's own
gate record, and the fix is a correction to that description. It needs no new commit on the
reviewed hash and no rewrite of it. A fresh agent re-reviews round two against the corrected
record, and the pins it needs are all in this file.
