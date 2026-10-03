# Review: topic SSE, issue 9, round 1

Written by GLM 5.3 Flash, a coding agent review. Like the other model notes on the sibling
branches, this file rides the branch and records one model's read. It is not a maintainer
approval.

- Hash reviewed: `07f1580570bf69a05a1ddae9c727f7fdbe987911` (branch `issue-9-topic-sse`, 3 commits
  on `main` `ddc87c3`)
- Worktree: `/home/nryn/work/chaaya-wt/issue9-rev-r1` (detached at the hash)
- Spec: GitHub issue nrynss/chaaya#9, a generic named-event stream beyond job frames
- Scope read: the full `main...07f1580` diff (11 files), `core/sse/loop.svelte.ts`,
  `core/sse/events.svelte.ts`, `core/sse/events.test.ts`, `core/sse/frame.ts`, the rewritten
  `core/job/job.svelte.ts`, the README and docs changes, and `main:src/lib/core/job/job.svelte.ts`
  for behaviour comparison.

## What the gate measured in this worktree

`npm ci`, then `./tools/check.sh`, twice.

- Run 1, exit 1. svelte-check, eslint, the Svelte 4 leakage scan, the visual values scan, the Keel
  fixture byte diff, and the full vitest suite (222 tests, 30 files) all passed. The Playwright leg
  failed one test: `[firefox] tests/playwright/audio-stream.spec.ts:174 a flush stops the audio
  within one block`. 191 other tests passed. The steps after Playwright did not run.
- Run 2, exit 0. Every check passed, including svelte-package, publint, the published-api check
  (deferred: no `api/0.3.0` record yet), the packed-tarball import and typecheck of every export
  key, the server-safety import, the consumer-name scan, and the plan-reference scan.

The run-1 failure is a workstation flake, not this branch: the failing leg re-run alone passed, the
branch touches no audio module and no test, and the full re-run cleared all 192. The mutations
below ran in this worktree and the tree was restored afterwards (`git status --porcelain`, 0
lines, after removing the temporary pin test).

## Spec compliance (issue 9)

| Requirement | Verdict |
| --- | --- |
| A generic client for arbitrary named SSE topics, separate from job-shaped parsing | Met. `createEventStream` and `EventStream` live in `core/sse/events.svelte.ts` and read no job frame. `events` filters names, `terminal` ends the watch, `onFrame`/`onComment`/`onReconnect` are the caller's hooks. |
| Reconnect and an optional catch-up hook | Met. The stream sits on the shared `FrameLoop`, so the schedule is the existing `ReconnectOptions` with the same defaults. `catchUp` runs once per open connection, and the loop reads frames while it runs. |
| Job helpers stay as today | Met, with one surface note. `JobStream` now delegates connect, read, reconnect, and abort to `FrameLoop`. The acceptance rules are preserved (see below). `connection` and `reconnects` became read-only getters, where `main` had public `$state` fields. 0.3.0 is unpublished, so this is a note for the release, not a defect. |
| One follow loop (the kit-by-design follow-through) | Met. The fetch/read/reconnect loop exists once, in `core/sse/loop.svelte.ts`. `JobStream` and `createEventStream` both project onto it. Nothing copies the loop. |

## Behaviour comparison against main

Preserved for `JobStream`: a refused frame, a name outside `frameMap`, and an `ignore` action
return `{ keep: false }`, so nothing is pushed and Last-Event-ID does not move. A `progress` or
terminal action returns `{ keep: true }`, the frame is pushed, `onAccept` runs, and the cursor
moves only when the frame carried an id line. A terminal ends the watch after the id is applied.
The job catch-up still never moves the cursor.

New and documented for `EventStream`: primed and catch-up events move the cursor here, because
they are not wire frames; a wire frame moves it only on an id line; an empty `id:` line or an
explicit `id: 0` resets it; a comment frame never moves it, which is the deliberate WHATWG
deviation named in the code, the docs page, and the README. The first connect sends no
`Last-Event-ID`, even after `prime()`. The restart failure mode (ids that climb again without a
reset are dropped in silence) is written down in all three places.

## Findings

| Severity | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| M | `src/lib/core/sse/loop.svelte.ts`, `#dispatch` comment branch (lines 240 to 244 at the reviewed hash). | A throwing `onComment` handler is a dropped stream, not a dropped frame. The loop wraps `onFrame` in try/catch and documents "A thrown error is a dropped frame, not a dropped stream". The comment branch has no guard, so a throw escapes `#dispatch` into `#read`'s catch, which reconnects. A backend with a periodic heartbeat turns a bug in the caller's `onComment` into an endless loop: every open resets the attempt counter to 0, the next comment throws, the stream reconnects. Unbounded request churn, no `failed` state, no surfaced error. This is new surface in this PR, because the job loop had no `onComment` before. | A temporary pin test written, run, and deleted in this worktree: a `FrameLoop` whose `onComment` throws, a fetch stub serving one comment per open, reconnect base 0. The committed code reopens the stream (`fetch` called twice or more within 2 s, connection never `failed`). | Wrap the `onComment` call in the same try/catch the `onFrame` branch has. The pin then fails: one fetch, no reconnect, the stream stays live. Measured in this worktree. |
| L | `src/lib/core/index.ts` line 15 and `src/lib/core/sse/index.ts` line 12. | `isReplayId` and `nextEventId` are exported from both barrels. Nothing outside `core/sse` imports either. They are the loop's internal id rule, and exporting them is an API promise with no consumer. The library rule is unexport by default. | `grep -rn "isReplayId\|nextEventId" src` returns only `core/sse` sources and the two export lines. | Drop both names from both export lines and keep them module-internal. svelte-package, the published-types probe, and the vitest suite pass unchanged, which proves no consumer needs them. |

## Review questions

1. **Did a Svelte 4 idiom slip in?** No. The leakage scan passed in both gate runs. My own read:
   runes appear only in the two `.svelte.ts` files, `$state` drives every published value, and no
   `export let`, `$:`, or `svelte/store` import exists under `src/lib`.
2. **Does a module touch a browser global at import time?** No. The server-safety probe imported
   every export key under plain node in run 2. `window` is read only inside `FrameLoop#connect`,
   guarded by `typeof window === "undefined"`.
3. **Does a component carry a visual value?** No. The visual-values scan passed, and the docs page
   change is prose only.
4. **Does the commit name a consumer?** No. All three commit messages read. The docs example is an
   inbox on any `text/event-stream` server and names no product.
5. **Does any code, comment or test cite a phase, a task, or a planning file?** No. The
   plan-reference scan passed on run 2, and I read every changed file. The WHATWG deviation
   comments state the reason themselves.
6. **Was this review run on the handed hash, in a worktree of its own?** Yes. Detached worktree
   `/home/nryn/work/chaaya-wt/issue9-rev-r1` at the hash above, confirmed with `git log -1`. The
   mutations ran there and were reverted, and the temporary pin file was deleted.

## Process notes

- The branch sits directly on `main` `ddc87c3`, so landing is a fast-forward after remediation.
- No commit carries a `Chaaya-Task` trailer. Same open owner decision as the kit-by-design branch.
- The branch does not change `tools/check.sh`, so the clean-clone triple rule does not re-arm.

## Observations, not findings

- A terminal name that is absent from the `events` filter can never stop the stream, because the
  filter refuses the frame before the terminal check runs. Correct, but undocumented. One sentence
  in the options docs would save a caller the surprise.
- `prime()` with a terminal event closes the stream before `attach()`, so `attach()` then connects
  nothing. Correct, and consistent with "the first one closes it", but worth a sentence.
- Each accepted wire frame is parsed twice (once in `#dispatch`, once by the projection reading
  `frame.id`). The parse is pure and small. Not worth complexity.
- The docs example shows `stream.prime(buffer.drain())` before `attach()`, which is the required
  order. The `EventStream` interface comment says so. Good.

## Verdict

**REMEDIATE.** 1 M, 1 L, 0 C, 0 H. The M is a two-line guard plus a test. The L is two export
lines. No verdict on anything outside `main...07f1580`.
