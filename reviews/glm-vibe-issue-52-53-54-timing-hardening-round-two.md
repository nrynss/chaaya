# Review of the timing hardening, the second pass

This file records one agent's read of the change. It is not a maintainer approval.

- Reviewed hash: `357ef326858606d9e11677371e608cf346d1babd`, confirmed with `git log -1`.
- Base: `origin/main` at `89c484b`. Pull request 57, closing issues 52, 53 and 54 in one landing.
- Worktree: `/home/nryn/work/chaaya-wt/issue-52-53-54-rev-r2`, a detached worktree of its own.
- Reviewer: a fresh agent that did not write the change and did not write the first pass. It
  differs from the first pass reviewer by session.
- Tree state: clean at the reviewed hash before, between and after every mutation, confirmed
  with `git status --porcelain` after each revert.
- Host load during this review: 8.6 to 21.3, read from `/proc/loadavg` beside each run.

## What this pass verified

### The first pass M, the owned context startup check

Fixed. Both startup checks at `tests/playwright/audio-capture.spec.ts:348` and `:391` now carry
the same retry shape. Each holds one closed over `judgeStartup`, calls it on every attempt, and
judges the last take again outside the loop, uncaught. The compressed check re-records with the
same init scripts, because `addInitScript` re-applies on the retry's own navigation. The owned
check re-records with `owned` true, so the judgement never changes between attempts.

Mutation two below is the load-bearing proof that the retries never pass a defect. With the
signal dropping every fourth marker, all four capture takes failed every attempt and the tests
failed. A defect present on every attempt fails every judgement.

My own repeats of the exact command the remediation claim rests on:

```
npx playwright test --project=firefox --project=chromium tests/playwright/audio-capture.spec.ts \
  --grep "startup preserves" --repeat-each=10
```

40 passed, 0 failed, 57.9 seconds, load 9 to 15. Each attempt spent about 6 seconds, so no run
came near the retry loop's third attempt.

### The first pass L, the describe's depth

Half fixed. The `a granted microphone` describe at line 303 now sits at column zero, which
matches main, and its close at 461 matches its open. The sibling half of that finding remains.
The three sibling tests sit at column zero, level with the describe they belong to, where main
holds them one tab in. That residue, and a new instance the budget commit added, are the first
finding below.

### The four answers to the bot review

All four are in the tree and read correct.

1. The truncation flag is keyed by the attempt number in the query. The route at
   `src/routes/tests/audio-playback/media/[name]/+server.ts:126` reads the query, serves the
   dying transfer once per attempt, and refuses every later ask with a hard 502. The spec at
   `tests/playwright/audio-playback.spec.ts:207` puts `testInfo.retry` in the query. The config
   sets no retries, so one server sees attempt 0 once, and a fresh invocation restarts the
   server. No collision is reachable, and the set grows one entry per attempt.
2. The takes test carries the 90 second budget at `tests/playwright/audio-capture.spec.ts:315`,
   with a comment that states why. The two startup checks run the same three attempt shape
   without it. That gap is the second finding below.
3. The support retry opens the harness fresh per attempt. `tests/playwright/audio-support.spec.ts:87`
   and `:151` call `open(page)` inside each attempt, and the comment names the reason. A
   completed phase would hand the retry the very take that failed.
4. The stream flush verdict keeps its conditional skip with the limit stated in the comment at
   `tests/playwright/audio-stream.spec.ts:227`. My judgement on that skip follows.

### The conditional skip on the flush verdicts, judged

Honest, and I record the limit it accepts.

The skip only drops a silence verdict when the bytes end before the window it probes. The live
energy verdict runs in every run, clamped to the bytes the file holds. The cut position and the
schedule verdicts come from the page state and run in every run. So no run passes without at
least one real burst verified inside the bytes. The check never goes vacuous.

The author's evidence shows a loaded recorder handing back 0.42 to 0.77 second files for a 1.3
second window. An assertion against the tail of such a file reads nothing, because the bytes do
not exist. Forcing it would fail the gate on the host, not on the product. The comment states
this limit where the skip lives.

The first pass reviewer's note on the anchor still holds. A recorder that misses the first two
bursts shifts the alignment one block, and the late probe then sits one block off the burst it
hunts. Mutation one below still failed both engines, so the catch measures the defect in the
regime this host produces. I record the weakening as a stated limit, as the first pass did.

## Mutations, applied by me on this hash

| Mutation | My result |
|---|---|
| `source.stop(cut + 3600)` in `src/lib/audio/playback/stream.svelte.ts:110` | the flush check fails on chromium and firefox |
| `slot % 4 !== 3` added in `tests/playwright/support/audio/input.ts:161` | the support spacing check fails on both engines, and all four capture takes fail every attempt |
| `if (code === 2) return "decode"` in `src/lib/audio/playback/player.svelte.ts:320` | the truncation check fails on firefox-sink |
| The dedup filter at `src/lib/adapters/keel/upload/upload.svelte.ts:263` deleted | the reload check fails on chromium |

Every mutation was reverted and the tree confirmed clean before the next run. The mutation
table in the pull request description matches my measurements.

## My own repeats

| Spec | Legs | Result | Load |
|---|---|---|---|
| audio-capture, both startup checks, 10 repeats | firefox, chromium | 40 passed, 0 failed | 9 to 15 |
| audio-stream, 10 repeats | chromium, firefox | 40 passed, 0 failed | up to 16.1 |
| audio-support, 10 repeats | chromium, firefox | 80 passed, 0 failed | up to 21.3 |

Logs: `/tmp/rev-r2-startup.log`, `/tmp/rev-r2-stream.log`, `/tmp/rev-r2-support.log`.

## Gate evidence

`./tools/check.sh` in this worktree, exit 0, start load 8.6. Log at `/tmp/rev-r2-gate.log`.

- svelte-check, eslint, the Svelte 4 scan, the visual values scan, the keel fixture compare and
  vitest (309 tests) all passed.
- The bare leg ran chromium, firefox and the sink project: 211 passed, 3 skipped. Webkit cannot
  launch on this host, so it ran inside the pinned image with the static ffmpeg pair: 96 passed,
  11 skipped.
- svelte-package, publint, the published api check, the published types probe, the server safety
  guard, the consumer names scan and the plan references scan all passed. The run ends with
  `Every check passed.`

CI on the reviewed hash: workflow CI, job `gate`, conclusion success, run 37367605882. GitHub
reports main as not branch protected, so the gate's requiredness here is the repository's own
landing rule rather than a GitHub enforcement. I record both facts.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| L | `tests/playwright/audio-capture.spec.ts:306`, and `:348`, `:391`, `:436` | Two nesting residues sit in the same describe. Lines 306 to 315, the skip and the new budget, sit four tabs deep while the sibling statements at 316 sit three. The budget commit introduced that. The three sibling tests sit at column zero, level with the describe they belong to, where main holds them one tab in. The first pass finding's describe dedent landed and its bracket mismatch went away, and this sibling half of it did not. The file misleads a reader about nesting in both places. No behaviour change, and no gate step measures indentation. | `awk 'NR==311 \|\| NR==317' tests/playwright/audio-capture.spec.ts \| cat -A` shows the skip at four tabs and `const judge` at three. `git show main:tests/playwright/audio-capture.spec.ts \| awk 'NR==331 \|\| NR==357 \|\| NR==385'` shows main holds the three sibling tests one tab in. `grep -n '^test("compressed startup' tests/playwright/audio-capture.spec.ts` shows this tree holds the first at none. | From a fixed tree, indent lines 306 to 315 one tab again, and the tab count probe fires again. Dedent the three sibling test openers one tab further, and the column zero probe fires again. |
| L | `tests/playwright/audio-capture.spec.ts:348` and `:391`, against `:315` and `playwright.config.ts:19` | The two startup checks re-record up to three attempts and keep Playwright's default 30 second budget. The takes test at 315 carries 90 seconds for the same shape, and its own comment says three attempts have to fit on a loaded host. Three slow attempts can exceed 30 seconds and time the check out, which is the false failure under load this change exists to remove. I measured no failure. My 20 startup runs each spent about 6 seconds in one attempt and never retried. The inconsistency with the sibling check is the defect I can measure. | `grep -n "test.setTimeout" tests/playwright/audio-capture.spec.ts` returns lines 315, 628 and 653, and nothing inside the startup tests at 348 and 391. Line 19 of `playwright.config.ts` sets the 30 second default they inherit. | Delete `test.setTimeout(90_000)` at line 315. The takes test then carries the same exposure the startup checks already carry, and three loaded attempts can time it out the same way. |

## Out of scope

None this pass. The first pass out of scope row, the network drop spacing epsilon, is open as
its own issue numbered 58 in the repository tracker.

## Judged not defects

- The conditional flush skip, judged above. Honest, with the anchor weakening recorded as a
  stated limit.
- The support pair retries four attempts while the single take retries three. Both fail safe,
  and the pair records two takes per attempt, so the wider count has a reason in its cost.
- `recordTake` runs a 60 second pass loop inside the 90 second budget. A slow attempt times out
  and fails the test. It never passes a defect.
- The truncation set grows one entry per attempt and never clears. One test drives the name, the
  config sets no retries, and a fresh invocation restarts the server, so nothing collides.

## The seven questions

1. Did a Svelte 4 idiom slip in? No. The changed pages use `$state` and `$effect`. No `export
   let`, no `$:`, no store import. The gate's own scan passes on this tree.
2. Does a module touch a browser global at import time? No. The diff touches two harness pages,
   one server route, one node fixture and five spec files. No `src/lib` module changes. Browser
   access sits inside functions and effects.
3. Does a component carry a visual value? No. The gate's visual values scan passes, and I read
   the diff for one.
4. Does the change, its issue, or its pull request name a consumer? No. I searched the diff, the
   three issues and the pull request description. No consumer name appears.
5. Does any code, comment or test cite a planning file or a private note, or did stripping one
   lose the reason it carried? No. The new comments state their reasons themselves. I scanned
   this file with the gate's own patterns before finishing.
6. Does `docs/scope.md` still match what the change covers? Yes, and it needs no update. The
   change covers test tooling, two harness pages and one media route. It adds, removes or
   narrows no library coverage.
7. Was this review run on the handed hash, in a worktree of its own? Yes. Detached at
   `357ef32`, confirmed with `git log -1`. Clean before and after every mutation, confirmed with
   `git status --porcelain`.

## Verdict

REMEDIATE.

Severity counts: C 0, H 0, M 0, L 2, plus no out of scope rows.

The substance of the bundle held up everywhere I measured it. The first pass M is fixed on the
evidence above. The retry loops landed in commit 07fd670 on both startup checks in
`tests/playwright/audio-capture.spec.ts`. Mutation two proves the judgement, and 40 passing
repeats back it. The first pass L is half fixed by the same commit. Its describe half matches
main, and its sibling half remains, which is the first finding here. The second finding is a one
line budget the startup checks' new shape implies and does not carry.

Both findings are small, but an APPROVE needs zero residue against the first pass findings
severity by severity, and the first finding is that residue. The author fixes both as new
commits on the reviewed commit, and a fresh agent re-reviews.
