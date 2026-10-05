# Review, issues 52, 53 and 54, timing hardening

This file records one agent's read of the change. It is not a maintainer approval.

- Reviewed hash: `3ac348680e4c889e591f3d8437e5eb9b4f2518fd`, confirmed with `git log -1`.
- Base: `origin/main` at `89c484b`.
- Pull request: #57, closing #52, #53 and #54 in one landing at the owner's request.
- Worktree: `/home/nryn/work/chaaya-wt/issue-52-53-54-rev-r1`, a detached worktree of its own.
- Tree state: clean at the reviewed hash. Every mutation below was reverted and confirmed with
  `git status` before the next run.
- Host load during this review: 9 to 16, measured from `/proc/loadavg` beside each run.
- CI: the required `gate` check on the pull request concluded SUCCESS
  (run 37356498445, 5m9s). A CodeRabbit check stayed pending and is not required.

## What I verified

The PR description's mutation table matches my measurements exactly. I applied each mutation
myself in this worktree and reverted it.

| Mutation | My result |
|---|---|
| Every flush stop deferred an hour (`source.stop(cut + 3600)` in `src/lib/audio/playback/stream.svelte.ts`) | the flush check fails on chromium and firefox |
| The signal drops every fourth marker (`slot % 4 !== 3` added in `tests/playwright/support/audio/input.ts`) | the support spacing check fails on both engines and all four capture takes fail every attempt (6 failed) |
| Code 2 classified as decode (`src/lib/audio/playback/player.svelte.ts`) | the truncation check fails on firefox-sink |
| Resume without deduplication (`src/lib/adapters/keel/upload/upload.svelte.ts`) | the reload check fails on chromium |

The PR description's recorded logs match their tables. I read `/tmp/verify-stream.log`
(80 passed), `/tmp/verify-support.log` (160 passed), `/tmp/verify-capture.log` (400 passed),
`/tmp/verify-playback.log` (140 passed, 40 skipped), `/tmp/verify-upload.log` (80 passed) and
`/tmp/gate-52.log` (ends `Every check passed.`). Each log header names the command the
description claims.

My own repeat evidence:

- 10 repeats of `audio-stream.spec.ts` on chromium and firefox: 40 passed, 0 failed, load 10 to 11.
- A dedicated bare playwright leg (`chromium`, `firefox`, `firefox-sink`): 211 passed, 0 failed,
  load 14 to 15.5.
- The webkit docker leg, run by me in this worktree with the pinned image and the static ffmpeg
  pair: 96 passed, 0 failed, exit 0 (`/tmp/rev-r1-webkit.log`).

The retry loops are honest. I read all three. The support spacing loop and the capture regular
take loop judge every attempt with one closed-over assertion set, and the last take is judged
again outside the loop, uncaught. The drained take loop runs the whole pipeline per attempt
against a fresh fixture and throws the last attempt's error. Mutation one proves the point: a
defect present on every attempt fails every attempt.

The upload hold boundary holds. In `tests/fixtures/upload-server.mjs` the hold branch answers
through `json()` directly, so a held write never reaches `refuse()` and never enters
`log.refusals`. The held check sits before the write accounting, so held writes also leave no
write count. The reload test's `refusals` assertion still guards the protocol.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| M | `tests/playwright/audio-capture.spec.ts:392`, with the harness gate at `src/routes/tests/audio-capture/+page.svelte:79` | The owned context startup check still fails intermittently under load. This member belongs to the #52 family, and this change claims its fix. I measured two failures on this hash. In both failed runs the take's attached bytes carry all 14 markers, evenly spaced over a full length take. A re-read of the same bytes finds them. So the reading taken during the run lost markers the bytes themselves hold. The three sounding chunk gate bounds the capture's head, not this loss. The check carries no retry, unlike the three retry loops this change adds. | Failure one: `./tools/check.sh` lost it in the bare leg at load 10 to 14. Received length 10, array 0.525 to 1.425. Log at `/tmp/rev-r1-gate.log`. Failure two: `npx playwright test --project=firefox tests/playwright/audio-capture.spec.ts --grep "owned context" --repeat-each=15` lost 1 of 15 at load 13 to 16. Received length 13. Log at `/tmp/rev-owned-startup2.log`. Both failed takes open their signal about 0.425 seconds in. Re-reading failure two's attachment with the repository reader returns 14 onsets. Re-reading failure one's attachment through a byte equal decode of the same shape returns 14. | No edit reintroduces it, the handed hash carries it. Reverting the fix this change offers the member, `soundingChunks === 3` to `=== 1`, restores the recorded head loss shape and raises the rate. |
| L | `tests/playwright/audio-capture.spec.ts:303` | The change indents the `a granted microphone` describe one tab deeper than main. Its sibling tests keep their old depth, so they now sit level with the describe itself, and the describe's closing bracket sits shallower than its open. The file misleads a reader about nesting. No behaviour change, and no gate step measures it. | `awk 'NR==303 \|\| NR==344 \|\| NR==423' tests/playwright/audio-capture.spec.ts \| cat -A` shows the open at one tab, the sibling at 344 at one tab, and the close at 423 at none. A child sits level with its parent and the close sits shallower than the open. | Dedent lines 303 and 342 one tab, which restores main, or indent the sibling test lines one tab. |

## Out of scope

| Severity | Where | What | Pin | Owning path |
|---|---|---|---|---|
| M | `tests/playwright/audio-upload.spec.ts:232` | My second full gate run lost `a take streams in chunks through a brief network drop and arrives whole`. This PR does not touch that test, and none of the three issues names it. A spacing landed exactly 20 milliseconds off. The float difference reads 0.020000000000000004 against a 0.02 bound, so the comparison fails on epsilon, not on substance. Present on main, load brings it out. | `/tmp/rev-r1-gate2.log`, received value 0.020000000000000004, at load 13 to 16. | `tests/playwright/audio-upload.spec.ts`, the spacing comparison in the network drop test. It needs its own issue. |

## Judged not defects

- The flush alignment comment names the loaded regime, where the recorder misses the first burst
  and the first detected onset sits one block later than the scene's own first marker. On a quiet
  host the first burst is captured and the mapping sits one block off the comment's model. I
  traced both regimes. The pass and fail verdicts of every slot assertion hold within one block
  of skew, and my mutation run failed on both engines. Arguable, behaviour correct, no finding.
- The fixture header still says a repeated write of a held index is accepted, an older sense of
  held than the new hold control. The new hold comment at the branch disambiguates the control
  where it lives. Arguable, no finding.
- A recorder delay past the second burst would put the flush alignment's first onset two blocks
  late and weaken the mutation catch. No recorded failure reaches that regime and I cannot pin it
  without controlling the recorder's delay. Recorded as a limit, not a finding.

## The seven questions

1. Did a Svelte 4 idiom slip in? No. The page uses `$state` and `$effect`. No `export let`, no
   `$:`, no store import.
2. Does a module touch a browser global at import time? No. The diff touches two SvelteKit route
   files, four spec files, one fixture and no `src/lib` module. Browser access stays inside
   functions and effects. The fixture is a node server.
3. Does a component carry a visual value? No colours, fonts, shadows or spacing values anywhere
   in the diff.
4. Does the change, its issue, or its pull request name a consumer? No. I searched the diff, the
   three issues and the PR description. No consumer name appears.
5. Does any code, comment or test cite a planning file or a private note, or did stripping one
   lose the reason it carried? No. The new comments state their reasons themselves. The gate's
   own scans pass on this tree, including my review file sitting untracked in it.
6. Does `docs/scope.md` still match what the change covers? Yes, and it needs no update. The
   change covers test tooling, two harness pages and one media route. It adds, removes or narrows
   no library coverage, so it touches no scope document.
7. Was this review run on the handed hash, in a worktree of its own? Yes. Detached at
   `3ac3486`, confirmed with `git log -1`, clean tree before and after every mutation.

## Gate evidence

Every gate step has local evidence on the reviewed hash in this worktree.

- `svelte-check`, `eslint`, the Svelte 4 scan, the visual values scan, the keel fixture compare
  and vitest (309 tests) passed in both full gate runs.
- The bare playwright leg failed twice, once per run, on two different flaky members (finding one
  and the out of scope row). A dedicated rerun of the same bare leg passed 211 tests. The webkit
  docker leg passed 96 tests in my own run.
- `svelte-package`, `publint`, the published API check, the published types probe, the server
  safety guard, the consumer names scan and the plan references scan all passed when I ran them
  here after the playwright step.
- CI's required `gate` check passed on the pull request, which carries the full four project
  sequence on its own host.

## Verdict

REMEDIATE.

Severity counts: C 0, H 0, M 1, L 1, plus one out of scope row at M that becomes its own issue.

The bundle does not hide anything. Each issue's fix is separable in the diff. #52 owns the flush
alignment, the support gap alignment, the three retry loops and the three chunk steady gate. #53
owns the truncation route's later ask refusals. #54 owns the upload hold. They share one
verification run, which is the bundle's stated reason, and the verification holds up.

The change makes the family markedly steadier. My own gate runs still lost the in scope member
once each, which is what finding one records. The verdict blocks until that member's residual is
fixed as new commits.
