# Review: the caller-owned video element through the player, issue 38, second round

- Reviewed hash: `cd0aae1`, the head of `issue-38-video-element`, three commits on `origin/main`
- Worktree: `/home/nryn/work/chaaya-wt/issue-38-rev-r2`, detached, confirmed with `git log -1` before any work
- Reviewer: glm, second round on this branch. This agent is fresh, did not write the change, and is distinct from the first-round reviewer.
- This file records one agent's read. It is not a maintainer approval.

## What this round read

The change carries the whole player widening at `2eabaae`, the first-round review file at `57c6eea`, and the remediation at `cd0aae1`. The remediation touches only `#prime` in `src/lib/audio/playback/player.svelte.ts`. It reads `element.muted` into `mutedBefore` before the prime mutes, and restores that value on the success path at line 231 and on the refusal path at line 236. The docstring now states the restore. Nothing else moved between the hash the first round reviewed and this one.

## How I verified the remediation

I wrote my own pin and did not reuse the author's probe. It lives at `glm-r2/mute-adopted-r2.spec.ts` under the gitignored probes root that the protocol names, with a throwaway route at `src/routes/probes/r2mute/+page.svelte` in this worktree only. The route declares `<video muted>` in its own markup, which is the exact shape the first-round finding describes. The spec adds `--autoplay-policy=user-gesture-required` to the launch, and reads the element once, after the playing flag rises and a 1.5 second settle, because the restore lands before the real source plays.

Four measurements at `cd0aae1`, all on chromium, run with `npx playwright test --config <probes root>/probe.config.ts <probes root>/glm-r2/mute-adopted-r2.spec.ts` from the repository root:

- An element the markup declared muted comes out of the prime muted. Read: true. The first-round defect is gone.
- An element muted by property before the gesture, on the tracked harness, comes out muted. Read: true.
- An element that entered the prime unmuted comes out unmuted. Read: false. The fix is a restore, not a removed unmute.
- A prime started with no gesture behind it keeps the carried state. Read: true, with `unlocked: true` and no refusal. On this host the prime resolves on the success path even without a gesture, so the refusal-path restore at line 236 has no browser observation here. Its shape is byte for byte the one line 231 carries, and line 231 is measured.

I then ran the mutation. I changed both restore sites to `element.muted = false`, the exact first-round defect, and reran the probe. Three measurements read false and failed. The unmuted measurement still passed. The pin is load-bearing. I reverted with `git checkout --` and `git status --porcelain` shows only the untracked probe route.

## Gate

`npm ci`, then `./tools/check.sh`, in this worktree, first attempt, exit 0, no reruns needed. The host carried a load average near 13 on 12 cores.

1. Audio tools, svelte-check, eslint, the svelte 4 scan, the visual values scan, and the keel fixture diff passed.
2. Vitest passed 309 of 309.
3. The bare leg ran chromium and firefox: 202 passed, 1 skipped, including the whole video spec.
4. The webkit leg ran inside `mcr.microsoft.com/playwright:v1.63.0-noble`: 95 passed, 11 skipped. No pre-existing audio flake surfaced this attempt.
5. svelte-package, publint, the published api check, the packed types check, server safety, the consumer names scan, and the plan references scan all passed.

Dedicated runs beside the gate:

- `npx playwright test --project=chromium --project=firefox tests/playwright/video-playback.spec.ts`: 10 passed.
- The gate's own docker command, video spec only, webkit project: 5 passed.
- `npx playwright test --project=chromium --project=firefox-sink tests/playwright/audio-playback.spec.ts`: 15 passed, 3 skipped, including the sink-loss classification.

The rest of the release surface reads as the first round found it. `dist/audio/playback/player.svelte.d.ts` exports `AudioPlayerOptions` with `readonly element: HTMLMediaElement` and `constructor(options?: AudioPlayerOptions)`, and `dist/audio/index.d.ts` re-exports the type. `api/0.4.0` does not exist. `api/0.3.0` is byte for byte what `origin/main` carries, checked with a tree diff of an archive of `origin/main`. `ffprobe tests/fixtures/video/clip.webm` reads vp8, 96x72, 5/1 fps, matroska, 300.000000 seconds, and no audio stream.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| L | `tests/playwright/video-playback.spec.ts`, the file this change adds, against the behaviour at `src/lib/audio/playback/player.svelte.ts:231` and `:236` at `cd0aae1` | The remediation's restore is guarded by no tracked measurement. No file under `tests/` reads the element's mute state at all. Both probes that verify the fix, the author's and mine, sit under the gitignored probes root and go away when the reviews close. A later change can reintroduce the first-round defect and land it with a green gate. | Run the reintroduction on the reviewed tree: change both `element.muted = mutedBefore` to `element.muted = false`, then `npx playwright test --project=chromium tests/playwright/video-playback.spec.ts`. Measured at this review: 5 passed, 0 failed. The same tree fails my probe with 3 of 4 measurements, which shows the only protection is the throwaway. | The pin's edit is itself the reintroduction. Once one tracked test reads an adopted markup-muted element after the first gesture, and one reads an unmuted element the same way, that two-line edit fails the gate leg instead of only the probe. The unmuted read matters, because a wrong fix that never unmutes passes a muted-only test. |

## The seven questions

1. Svelte 4 idiom: none. The remediation touches a runes class only, with `$state` and arrow listeners. The pages use `$derived`, `onMount`, `bind:this`, and `onclick`. The leakage scan passed in my gate run.
2. Browser global at import time: none. The constructor stores the element and touches nothing. Adoption happens on first use. Server safety imported every entry point clean.
3. Visual value: none in `src/lib`. The visual values scan passed. The pages carry width and height on the video element, which is the caller's layout, as the first round read it.
4. Consumer named: no. The issue, the pull request, and the diff describe consumers generically. The consumer names scan passed.
5. Planning reference: none. The plan references scan passed. The remediation commit message and the new comments state their reasons themselves.
6. `docs/scope.md` still matches: yes. The remediation changes no coverage. The docs page prose that promised the markup state is now true, which is what the first-round M demanded.
7. Handed hash and own worktree: yes. Hash `cd0aae1` confirmed with `git log -1` before any work, in the detached worktree named above. My only writes were the probe files and the temporary mutation, and the mutation is reverted.

## Notes, not findings

- The refusal-path restore at line 236 has no browser observation on this host or in CI as configured, because a prime that mutes first resolves on every engine the gate runs. I read the two identical one-line restores as symmetry and measured the success path. A host that refuses the prime would need a different policy than the gate's projects set.
- The first-round OUT_OF_SCOPE row stands. `tools/check.sh` is untouched by this diff, the fallback path never runs the firefox-sink project, and issue 50 owns the fix. My dedicated firefox-sink run passed, so the leg is healthy when someone runs it.
- The probe route at `src/routes/probes/r2mute/` is a throwaway the pin needs. It rides untracked in this worktree and goes away with the probe once nothing cites it.
- The harness notes from the first round carry over unchanged. The range parser edge and the whole-file docs route answer remain notes, and the seek log remains house style.

## Verdict

REMEDIATE, with one L and zero C, H, or M. No residue stands against the first round, severity by severity: the single M is fixed at `cd0aae1`, and my own pin and mutation measure the fix directly. The first-round OUT_OF_SCOPE row is not residue and stays with issue 50. The L above asks for one tracked measurement of the behaviour the remediation restored, in the spec this change already adds, asserting both the muted and the unmuted direction. A test-only commit cannot change behaviour and is the shape the protocol lets the author land without a fresh round, and the next review file records it by name and file.
