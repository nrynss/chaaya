# Review: the media element clock, issues 39, 45 and 46, first round

- Reviewed hash: `fde660c8c7e18e3a48ad2e9582e0d25e3efe6915`, three commits on `82dc5cf`, the head of `main` at review time
- Worktree: `/home/nryn/work/chaaya-wt/multi-39-45-46-media-clock-rev-r1`, detached, confirmed with `git log -1` before any work
- Reviewer: reviewer, first round on this branch
- This file records one agent's read, not a maintainer approval

## What the commits carry

`3a54cdb` binds timed words to video for issue 39. `mediaClock` adapts any media element to the `TranscriptClock` contract, and a player driving a caller owned video already meets it. A harness plays a generated clip behind six timed words, and a docs page shows the binding beside its gates.

`35c9da3` schedules timed audio clips for issue 45. Pure maths in `clips.ts` plans each clip at its in point and context time. `ClipScheduler` decodes once per key into a bounded cache, reschedules on play and seek from the element clock, corrects drift on timeupdate, and lists failed loads in a skipped set nothing replaces. A harness captures a marker tone clip against a generated video.

`fde660c` recovers expired signed URLs for issue 46. The entry route mints a short signature per run, and the rotate route expires it. `AudioPlayer` gains `resolveSource`, `resolveBudget`, and a `recoveries` count. A network failure with budget left swaps in a fresh signature and restores position and play state. The spent budget reports through the existing network failure shape.

## How I verified

- I read the diff against `main` in full. Existing audio follower tests and player tests pass unmodified. No Svelte 4 idiom, no browser global at import time, no visual value, no consumer name, no planning reference.
- I ran `npm ci` then `./tools/check.sh` to green on the reviewed tree. All legs pass on chromium, firefox, and webkit.
- Issue 39 pin: the rendered word tracks the element clock across three engines, and a word click seeks to the word start. Keyboard reaches every word, and the docs gates pass.
- Issue 45 pin: `clips.test.ts` asserts placements exactly in Vitest. The marker tone onset reads by sample count from the captured mix on three engines.
- Issue 46 pin: the browser request log shows chromium reusing the expired redirect with a 403, while firefox reasks the entry route. Recovery resumes past second 50 on every engine, with `recoveries >= 1` on chromium. The refusal loop spends a budget of one and reports network.
- Product behaviour is green. Every finding below is polish.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| L | `docs/scope.md:45` at the reviewed hash | The resolveSource sentence runs 37 words, past the 30 word docs limit. | `python3 -c` splitting the line on full stops reports a 37 word sentence. Split it and every fragment reads at most 17 words. | Join the three replacement sentences back into one and the 37 word count returns. |
| L | `src/lib/audio/playback/scheduler.svelte.ts:30-33` at the reviewed hash | The play or seek sentence runs 38 words, past the 30 word docs limit. | `python3 -c` splitting the comment on full stops reports a 38 word sentence. Split it and every fragment reads at most 18 words. | Join the three replacement sentences back into one and the 38 word count returns. |
| L | `src/routes/docs/clip-preview/+page.svelte:81` at the reviewed hash | The plan sentence runs 31 words, past the 30 word docs limit. | `python3 -c` splitting the paragraph on full stops reports a 31 word sentence. Split it and every fragment reads at most 17 words. | Join the three replacement sentences back into one and the 31 word count returns. |
| L | `src/routes/tests/clip-preview/+page.svelte:33-36` at the reviewed hash | The capture sentence runs 31 words, past the 30 word docs limit. | `python3 -c` splitting the comment on full stops reports a 31 word sentence. Split it and every fragment reads at most 16 words. | Join the three replacement sentences back into one and the 31 word count returns. |
| L | `tests/playwright/signed-expiry.spec.ts:26-28` at the reviewed hash | The helper sentence runs 31 words, past the 30 word docs limit. | `python3 -c` splitting the comment on full stops reports a 31 word sentence. Split it and every fragment reads at most 14 words. | Join the three replacement sentences back into one and the 31 word count returns. |
| L | `tests/playwright/signed-expiry.spec.ts:53-55` at the reviewed hash | The seek echo sentence runs 33 words, past the 30 word docs limit. | `python3 -c` splitting the comment on full stops reports a 33 word sentence. Split it and every fragment reads at most 14 words. | Join the three replacement sentences back into one and the 33 word count returns. |
| L | `tests/playwright/transcript-video.spec.ts:70-73` at the reviewed hash | The tab order sentence runs 32 words, past the 30 word docs limit. | `python3 -c` splitting the comment on full stops reports a 32 word sentence. Split it and every fragment reads at most 13 words. | Join the three replacement sentences back into one and the 32 word count returns. |
| L | `src/routes/docs/clip-preview/+page.svelte:83` at the reviewed hash | The video carries its source in markup, which raises the captions warning. The pre-existing video pages hand the source to the element in script. | `npm run check` reports `a11y_media_has_caption` on this file. Move the source into script and the warning count drops to zero. | Restore the source attribute in markup and the warning returns. |
| L | `src/routes/tests/clip-preview/+page.svelte:132` at the reviewed hash | The harness video carries its source in markup, which raises the same warning. The video harness already hands its source over in script. | `npm run check` reports `a11y_media_has_caption` on this file. Move the source into script and the warning count drops to zero. | Restore the source attribute in markup and the warning returns. |

## The seven questions

1. Svelte 4 idiom: none. New modules use runes, and the classes live in `.svelte.ts` files.
2. Browser global at import time: none. The scheduler and the player build on caller supplied contexts and elements, and construction touches nothing.
3. Visual value: none. Docs pages reuse the token reference stylesheet, and library code draws nothing.
4. Consumer names: none. The gate consumer scan passes on the reviewed tree.
5. Plan citations: none. Comments and docs cite tracked paths and issue links only.
6. Scope match: yes. `docs/scope.md` covers the follower binding, the clip scheduler, and the signed URL recovery, and the not covered list names only issues 41 and 42.
7. Hash and worktree: yes. A detached worktree of its own at the handed hash, confirmed before any work.

## Verdict

REMEDIATE, with C 0, H 0, M 0, L 9. Every finding is polish. No behaviour changes.
