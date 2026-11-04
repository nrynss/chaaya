# Review: #98 audio classes off runes

Branch `issue-98-audio-off-runes`. Reviewer: adversarial self-review, recorded per round.

## Round 1

Scope checked against the issue's acceptance list.

- No rune and no `svelte` import under `src/lib/audio/` (`find -name '*.svelte*'` and a rune grep are empty).
- Every existing audio Vitest file passes with no edits to existing tests. New tests were only appended.
- `AudioPlayer` notifies on seek, play, pause, `timeupdate` and source recovery, and not otherwise: `player.test.ts`. That includes no notification for `progress` with unchanged spans, `waiting`, `volumechange`, `canplay`, `seeking`, an unchanged `ratechange`, or a `durationchange` with no duration. A fake-timer check shows the player schedules no timer.
- Every audio route under `/docs` and `src/routes/tests` reads its class through `reactive(...)`.

Findings and resolutions:

1. **Narrowing after the guard in `AudioRecorder.start`.** The guard at the top narrowed the `state` getter, and writes now go through `#write`, so TypeScript flagged the later `!== "requesting"` checks as impossible. At runtime the getter reads live, so behaviour was right, but the types were wrong. Fixed: the later guards read `this.#fields.state` and carry a comment.
2. **Several notifications for one logical change in the recorder.** A failed take used to write `result`, `countdown`, `error` and `state` as separate runes. Fixed: `#batch` folds them into one notification. A test pins the take sequence `requesting, requesting (render rate), recording, stopped, idle`.
3. **`chunks` returned the live, mutated array.** A view holding that reference would not see a change. Fixed: `chunks` is a snapshot that is dropped per block and copied on read.
4. **`buffered` replaced on every `progress`.** That would notify on every progress event even when nothing new was buffered. Fixed: `#spans` keeps the held list when the spans are equal.
5. **`ClipScheduler.attach()` returned `void`.** The #95 conversion rules say that `attach()` returns its teardown. Fixed: it returns a stable teardown, and a second attach returns the same one. The return type widens from `void`, which stays source-compatible.

Mutation pass (cp backups, never `git checkout`): ten mutations across stream, player, recorder, level, scheduler and `mediaClock`, and every one was caught.

Open items for the owner (not defects):

- `TranscriptClock.subscribe` is optional here. #99 makes it required when the follower starts using it.
- A recovery notifies per step: the count, then the swap, then the restored position if it moved. Each step is a separate await.
- `LiveLevel` notifies on every sample, even when the level holds, because the issue asks for "once per sample".
- The state fields are read-only getters, and `AudioPlayer.rate` keeps its setter. Lists are typed `readonly`.

Verdict: APPROVE, pending the browser leg and CodeRabbit.
