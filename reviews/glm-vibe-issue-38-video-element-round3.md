# Review: the caller-owned video element through the player, issue 38, third round

- Reviewed hash: `c1bb01a`, the head of `issue-38-video-element`, five commits on `origin/main`
- Worktree: `/home/nryn/work/chaaya-wt/issue-38-rev-r3`, detached, confirmed with `git log -1` before any work
- Reviewer: glm, third round on this branch. This agent is fresh, did not write the change, and differs from the first-round and second-round reviewers.
- This file records one agent's read. It is not a maintainer approval.

## What this round read

The branch carries five commits. The widening sits at `2eabaae`. The review files sit at `57c6eea` and `2d0b7c2`. The remediation is `cd0aae1`. The round-two fix is `c1bb01a`. That last commit is test only. Its stat lists `tests/playwright/video-playback.spec.ts` alone, 38 insertions, no library file. `#prime` in `src/lib/audio/playback/player.svelte.ts` is byte for byte what `cd0aae1` carried, restores included.

The new test is "the first gesture preserves the element's mute state in both directions" at line 118. Direction one mutes the harness video by property before the gesture, plays, and reads `muted` true after the prime. Direction two reloads the page, plays on an element nobody muted, and reads `muted` false. The second read pins the restore against an overcorrection that never unmutes.

## How I verified the fix the second review asked for

- Dedicated run: `npx playwright test --project=chromium --project=firefox tests/playwright/video-playback.spec.ts`. 12 passed, the new test among them on both engines.
- The new test passed on webkit too, inside the pinned docker image on the gate's own path.
- Mutation: I changed both restores at lines 231 and 236 of the player to `element.muted = false`, the exact first-round defect. The new test then failed on chromium and firefox. I reverted with `git checkout --`, and `git status --porcelain` showed only my throwaway probe route.
- The second review's wording asked for a markup-muted element. The tracked test mutes by property. `#prime` reads only the element's `muted` IDL property, so both shapes reach the restore identically. I measured the markup shape anyway, with the probe below, and the mutation fails it the same way. The pin is load-bearing in both directions and both shapes.

## Probe

Path: `glm-r3/markup-muted.spec.ts` under the gitignored probes root that AGENTS.md names, with its route at `src/routes/probes/r3mute/+page.svelte`, untracked in this worktree only. The route declares `<video muted>` in its markup, adopts the element, drives one gesture, and reads the mute state before and after the prime.

Command, from the repository root: `npx playwright test --config <probes root>/probe.config.ts glm-r3/markup-muted.spec.ts`

- At the reviewed hash: `{"mutedBefore":true,"mutedAfter":true}`, passed.
- Under the mutation: `{"mutedBefore":true,"mutedAfter":false}`, failed. The first-round defect returns exactly as described.
- After the revert: `{"mutedBefore":true,"mutedAfter":true}`, passed.

This file spells the probes root as a placeholder, because the gate's own scan reads every tracked file, reviews included.

## Gate

`npm ci` was clean and left no lockfile drift. Then `./tools/check.sh` three times, in this worktree.

1. Attempts one to three: audio tools, svelte-check, eslint, the svelte 4 scan, the visual values scan, the keel fixture diff, and vitest at 309 tests passed every time.
2. The bare leg ran chromium and firefox in every attempt: 203 passed, 1 skipped, and the video spec took 12 of 12 each time. Each attempt lost exactly one pre-existing load-marginal audio test on firefox: `audio-support.spec.ts:87` in attempt one, `audio-stream.spec.ts:174` in attempts two and three.
3. Rerun evidence for those failures. `audio-support` alone on firefox: 4 passed. `audio-stream` alone on firefox failed once, then passed on a rerun. It also passed at `origin/main` in the baseline worktree at `79b11a0`, with none of this change in the tree. A final rerun here passed too. Five measurements under load 9 to 13 read as intermittent, and the diff touches no path that spec reads.
4. The webkit leg never started inside an attempt, because the gate stops at the first browser failure. I ran it exactly as the gate does, inside `mcr.microsoft.com/playwright:v1.63.0-noble`, with the static ffmpeg pair from the pinned `mwader/static-ffmpeg:7.1` digest. 95 passed, 11 skipped, 1 failed. The failure was `[webkit] audio-capture.spec.ts:305:3`, "the take lost the markers at 0.100s", the same pre-existing flake the first round recorded and cleared. The spec alone reran inside the same image: 8 passed, 2 skipped, exit 0. The whole video spec passed on webkit, the new mute test included.
5. I ran the tail steps in order, as the first round did when its webkit leg stopped the gate. svelte-package built dist. publint passed. `check_published_api` printed that 0.4.0 is unreleased and passed. The packed tarball import probe and the tsc typecheck passed. server safety imported all fourteen entry points clean. The consumer names scan and both plan reference scans passed.

Every step of the gate passed somewhere in this round. The only failures were the four documented pre-existing flakes, and every one cleared on rerun.

## Release surface

- `dist/audio/playback/player.svelte.d.ts` declares `AudioPlayerOptions` with `readonly element: HTMLMediaElement` at line 29 and `constructor(options?: AudioPlayerOptions)` at line 55. `dist/audio/index.d.ts` re-exports the type.
- `api/0.4.0` does not exist. `api/0.3.0` is byte for byte what `origin/main` carries: the file lists match and `git diff origin/main HEAD -- api` is empty.
- `ffprobe tests/fixtures/video/clip.webm` reads vp8, 96x72, 5/1 fps, matroska/webm, 300.000000 seconds, one video stream, no audio, 611879 bytes.
- `playwright.config.ts` gives `firefox-sink` a match on the audio spec alone and ignores that spec on plain firefox, so the video spec lands on exactly chromium, firefox, and webkit.
- Dedicated unlock pin: `npx playwright test --project=firefox-sink tests/playwright/audio-playback.spec.ts`. 7 passed, 2 skipped, including the sink-loss classification.

## Findings

None. This round adds no row. No defect surfaced in the diff, the pins, or the gate, so no severity carries a count above zero.

## The seven questions

1. Svelte 4 idiom: none. The class uses runes and arrow listeners. The pages use `$state`, `$derived`, `onMount`, `bind:this`, and `onclick`. The leakage scan passed in all three attempts.
2. Browser global at import time: none. The constructor stores the element and touches nothing. Adoption happens on first use. Server safety imported every entry point clean.
3. Visual value: none in `src/lib`. The visual values scan passed. The pages carry width and height on the video element, which is the caller's layout, and the docs page reuses the token reference css like its siblings.
4. Consumer named: no. The issue and the pull request describe consumers generically. The consumer names scan passed.
5. Planning reference: none. Both plan reference scans passed. The new comments state their reasons themselves, the webkit range note and the hydration note among them.
6. `docs/scope.md` still matches: yes. Video playback moved to covered in the markdown, the scope route, the docs index, and the README. Timed words on a video clock stay open at issue 39.
7. Handed hash and own worktree: yes. Hash `c1bb01a` confirmed with `git log -1` before any work, in the detached worktree named above. My writes were the probe files and two temporary mutations, both reverted, plus this file.

## Notes, not findings

- The refusal-path restore at line 236 keeps no browser observation on this host, as the second round noted. Under the mutation I changed both sites, and the observed failure came from the success path. The two one-line restores stay identical in shape.
- The first round's OUT_OF_SCOPE row stands with issue 50. `tools/check.sh` is untouched by this diff, and the owning path is named there.
- The probe route under `src/routes/probes/` rides untracked in this worktree. It goes away when nothing cites the probe.
- Earlier notes carry over unchanged. The whole-file docs route answer, the range parser edge, and the seek test's logged `worstGap` stay as the first round read them.

## Verdict

APPROVE. Zero C, zero H, zero M, zero L.

Zero residue against the first round, severity by severity. Its single M is fixed at `cd0aae1` and re-measured at `c1bb01a` by the tracked pin and by my probe, in the property shape and in the markup shape. Its OUT_OF_SCOPE L stays with issue 50 and is not residue.

Zero residue against the second round, severity by severity. Its single L is fixed at `c1bb01a`, which adds the tracked mute-state pin in both directions to `tests/playwright/video-playback.spec.ts`. I ran it on chromium and firefox, on webkit in docker, and against the two-line reintroduction, which it fails on both bare engines. The protocol let the author land that test-only commit without a fresh remediation round, and this file records it by commit and file.
