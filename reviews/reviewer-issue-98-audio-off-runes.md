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

## Round 2

Browser leg on the box (chromium, firefox, firefox-sink). WebKit cannot launch here: its system libraries are missing, and apt cannot reach the Debian mirror (500 errors). It needs a workstation.

Finding:

6. **The capture harness drifted its start mark.** `tests/audio-capture` had an `$effect` that read `recorder.state` and recorded the generated microphone's clock when the take entered `recording`. A rune effect re-ran only when `state` changed. Through `reactive()`, the effect re-ran on every notification, and that includes each block and each countdown tick, so the start mark kept moving later and the ffprobe marker placement failed. That was eight failures on chromium and firefox. A baseline run on main passed all twenty. Fixed: the effect reads `$derived(recorder?.state)`, which passes only changed values. After the fix, `audio-capture` passes 20 of 20 on chromium and firefox.

   This is the binding's coarse-grained notification, the design #95 chose, and not a defect in the audio classes. The CHANGELOG entry now says so, and the #102 migration guide should carry the same pattern.

The other `$effect` in the migrated routes (`tests/audio-stream`) only installs window hooks and reads no audio object, so it is unaffected.

## Round 3

- Merged main, which now carries #96 and #106. One conflict, in the `docs/scope.md` binding paragraph, was resolved by listing both sets of classes. svelte-check is clean, and the full Vitest run passes (564).
- The diff was re-read after the merge. Nothing in #96 touches audio, and the transcript follower still uses its own effect runner until #99.
- CodeRabbit is rate-limited, and the next slot is more than 30 minutes away. Under the owner's rule, this merges on a clean own review plus green CI.

Verdict: APPROVE.
