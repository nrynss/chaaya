# Review: the caller-owned video element through the player, issue 38, first round

- Reviewed hash: `2eabaae`, the head of `issue-38-video-element`, one commit on `origin/main`
- Worktree: `/home/nryn/work/chaaya-wt/issue-38-rev-r1`, detached, confirmed with `git log -1` before any work
- Reviewer: glm, first round on this branch, an agent that did not write the change
- This file records one agent's read. It is not a maintainer approval.

## What the commit carries

The player's element contract widens from `HTMLAudioElement` to `HTMLMediaElement`. `AudioPlayerOptions` exports from `@nrynss/chaaya/audio` and takes a `readonly element`. `#ensureElement` adopts a supplied element on first use, applies the rate, and attaches the listeners. Without one, the player builds its own audio element as before. `#listen` extracts the ten listeners so both shapes share them. Two harness pages, two media routes, a committed VP8 WebM fixture, a three-engine spec, a docs page, the scope and README updates, and the 0.4.0 bump.

## How I verified

- The adoption pin is load-bearing. The spec asserts the markup element's own `currentTime` moves with the player's through the `video-time` binding. The player is the only writer of that element's source. A player that built its own element would leave `video-time` at 0 and the poll would time out.
- The video spec passed on all three engines. Chromium and firefox: 10 of 10 in a dedicated run, `npx playwright test --project=chromium --project=firefox tests/playwright/video-playback.spec.ts`. WebKit: 5 of 5 inside the pinned image on the gate's docker path.
- The shared class still plays on the sink leg. `npx playwright test --project=firefox-sink tests/playwright/audio-playback.spec.ts` gives 7 passed and 2 skipped, including the sink-loss classification.
- The fixture measures as claimed. `ffprobe tests/fixtures/video/clip.webm` reads vp8, 96x72, 5/1 fps, matroska, 300.000000 seconds, and no audio stream.
- The built declarations carry the widened contract. `dist/audio/playback/player.svelte.d.ts` exports `AudioPlayerOptions` with `readonly element: HTMLMediaElement` and `constructor(options?: AudioPlayerOptions)`.
- The freeze behaves as the release procedure says. `check_published_api` prints that 0.4.0 is unreleased and defers the byte diff to the tag. `api/0.4.0` does not exist. `api/0.3.0` matches `origin/main` byte for byte, which `assert_published_history` checks and passed.
- The package-lock diff that adds the optional `@sveltejs/kit` peer is a lock refresh, not a contract change. `package.json` on `origin/main` already carries that peer. The lock on main was stale, and `npm ci` regenerated it.
- The failure classes map correctly. A 404 source lands on the fetch probe and reads network. Noise bytes with no header land on code 3 or on a successful probe and read decode. Both assertions passed on every engine that ran them.
- The docs page follows the house pattern of its sibling. The audio playback docs page also sets `ssr = false`, embeds no gates, and drives the player through native buttons and labelled inputs. Keyboard operability comes from native controls.

## Gate

`npm ci`, then `./tools/check.sh`, in this worktree. This is not a gate change, so no clean-clone triple run applies. The host carried load from unrelated processes.

1. Audio tools, svelte-check, eslint, the svelte 4 scan, the visual values scan, the keel fixture diff, and vitest at 309 tests all passed.
2. The bare leg ran chromium and firefox. 202 passed, 1 skipped, including the whole video spec.
3. The webkit leg ran inside `mcr.microsoft.com/playwright:v1.63.0-noble`. 94 passed, 11 skipped, 1 failed. The failure was `[webkit] audio-capture.spec.ts:305 a pcm take carries the generated markers`, "the take lost the markers at 0.100s". That spec is pre-existing, sits outside every path of this diff, and is on the known load-marginal list.
4. I reran that one spec inside the same image: `npx playwright test --project=webkit tests/playwright/audio-capture.spec.ts`. 8 passed, 2 skipped, exit 0. The flake is confirmed and is not recorded against this change.
5. The webkit failure stopped the gate before its tail, so I ran the remaining steps in order. `npm run package` built dist. `publint` passed. `check_published_api` passed with the unreleased message above. The packed tarball import probe and the tsc typecheck passed. `tools/guards/server-safety.mjs` imported all fourteen entry points clean. The consumer names scan and the plan references scan passed.

Every step of the gate passed. The one failure of the run is the documented pre-existing flake, and the rerun cleared it.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| M | `src/lib/audio/playback/player.svelte.ts:228` and `:233` at the reviewed hash | The first gesture's prime sets `element.muted = false` on both the success and the refusal path. An adopted element whose markup declared `muted` ends unmuted after the first gesture, so a video the caller made silent becomes audible. The claim at `:181` says a supplied element keeps the settings its markup gave it and that the player only applies its own rate and listeners. The docs page prose at `src/routes/docs/video-playback/+page.svelte:43` repeats it. The behaviour contradicts the claim in a shipped public contract. | Probe `glm-vibe/muted-adopted.spec.ts` in the gitignored probes root that AGENTS.md names, with its route at `src/routes/probes/muted-adopted/+page.svelte` in this worktree. Run, from the repository root, `npx playwright test --config <probes root>/probe.config.ts <probes root>/glm-vibe/muted-adopted.spec.ts`. The markup declares `muted`, the page reads the attribute on mount, drives one play, and reads it again. Output: `{"mutedBefore":"true","mutedAfter":"false","srcAfter":".../tests/video-playback/media/clip.webm"}`. This file spells the probes root as a placeholder, because the gate's own scan reads every tracked file, reviews included. | In `#prime`, read the element's `muted` before the prime and restore it on the adopted path. The probe then reads `mutedAfter` true. Deleting that restore reintroduces the flip and the probe reads false again. |
| OUT_OF_SCOPE L | `tools/check.sh:115` (the webkit fallback branch) | When webkit cannot launch bare, the fallback runs chromium and firefox bare and webkit in docker, and the firefox-sink project never runs. The positive branch of the sink-loss classification pin is then unmeasured on this workstation path. CI covers it, because webkit launches there and the full project list runs. The gap pre-exists on main and this diff does not touch the file. Owning path: `tools/check.sh`. | The gate log of step 2 above names both project pins on the bare leg, and a count of `firefox-sink` in the whole log is 0. The dedicated firefox-sink run under "How I verified" passes, which shows the leg is healthy when someone runs it. | After a fix that runs firefox-sink on the fallback path, restoring `-- --project=chromium --project=firefox` on the bare leg reintroduces the gap, and the log count returns to 0. |

## The seven questions

1. Svelte 4 idiom: none. The pages use `$state`, `$derived`, `onMount`, `bind:this`, and `onclick`. The class uses runes and arrow-function listeners. No `export let`, no `$:`, no store. The leakage scan passed.
2. Browser global at import time: none. The player builds or adopts an element on first use. The new server routes touch `node:fs` inside the request handler, and the noise array build is pure CPU on the server. The harness pages set `ssr = false` and touch the DOM in bindings and `onMount`. The server safety step imported every entry point clean.
3. Visual value: none in `src/lib`. The visual values scan passed. The pages carry width and height attributes on the video element, which is layout the caller owns, and the docs page reuses the token reference css like its siblings.
4. Consumer named: no. The issue and the pull request describe consumers generically. The consumer names scan passed over every tracked file.
5. Planning reference: none. The plan reference scans passed. The new comments state their reasons themselves, including the webkit range request note in the tests media route.
6. `docs/scope.md` still matches: yes. The markdown, the scope docs route, the docs index, and the README all move video playback to covered and keep timed words at issue 39. The scope route's wording tracks the markdown.
7. Handed hash and own worktree: yes. Hash `2eabaae` confirmed with `git log -1` before any work, in the detached worktree named above. The worktree held no edits of mine until this review file and the probe files.

## Notes, not findings

- The docs media route advertises `accept-ranges: bytes` and answers every ask with the whole file. RFC 7233 lets a server ignore Range, and browsers cope with a 200. The tests route answers ranges with capped slices, which is what the webkit clock needs.
- The range parser in the tests route treats a bare `bytes=-` as a suffix of zero bytes and would answer a malformed 206. No browser sends that header, and the function is a verbatim copy of the audio route's. No observer reaches it.
- The probe route under `src/routes/probes/` is a throwaway the pin needs. It rides untracked in this worktree only, and it goes away with the probe once the finding closes.
- The seek test logs `worstGap` without asserting it. That mirrors the audio spec's sink test, so I read it as house style and not as a dead measurement.

## Verdict

REMEDIATE, with one M and zero L, plus one OUT_OF_SCOPE L row against `tools/check.sh`. The M is one behaviour and its false claim in three places. Preserve the adopted element's mute state, or state the unmute honestly in the contract and the docs page, and the pin above decides which way it landed. Zero residue is not claimed, because the M above stands.
