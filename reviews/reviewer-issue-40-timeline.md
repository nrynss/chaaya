# Review: timeline geometry and edit handles, issue 40, round one

Written by reviewer, a coding agent review. This file rides the branch and records one
agent's read. It is not a maintainer approval.

- Hash reviewed: `705bce79d282921c34750e99ca6562f8ce76790f` (branch `issue-40-timeline`, 1 commit
  on `main` `52ff21e`)
- Worktree: `/home/nryn/work/chaaya-wt/issue-40-rev-r1` (detached at the hash)
- Spec: GitHub issue nrynss/chaaya#40, timeline geometry plus keyboard operable edit handles
- Scope read: the full `main...705bce7` diff (13 files), `src/lib/timeline/` in full with all
  three unit suites, both route pairs, the tracked Playwright spec, and the scope and README
  updates.

## What the gate measured in this worktree

`npm ci`, then `./tools/check.sh`, to green after two port collisions.

- Run 1, exit 1. Every step through the production build passed. The Playwright leg could not
  start its server because a sibling run held port 4173. No test ran, so this run proves
  nothing beyond the build.
- Run 2, exit 1. The server bound, then a sibling grabbed the port mid run and the run
  measured the sibling server instead. Its failures sat at page open on routes the sibling
  lacks. Discarded as cross talk.
- Run 3, exit 0. Full green. svelte-check, eslint, the Svelte 4 leakage scan, the visual
  values scan, the Keel fixture byte diff, and the full vitest suite (420 tests, 50 files,
  including 37 timeline tests) all passed. Playwright passed on all three engines through
  the gate docker fallback for webkit, including all 24 timeline runs. svelte-package,
  publint, the published api check, the published types probe, the server safety import of
  every key including the new timeline entry, the consumer name scan, and the plan reference
  scan all passed.

## Spec compliance (issue 40)

| Requirement | Verdict |
| --- | --- |
| Geometry, pure, with zoom, scroll, both mappings, and ruler ticks | Met. `scale.ts` holds the five functions. Exact vitest assertions cover every branch. |
| Edit maths, pure, with snap, bounds, minimum length, and no overlap | Met, with one defect below. `edit.ts` constrains and reports the target. |
| Handles, behaviour only, with pointer drag, Escape, and arrow keys | Met, with one defect below. The attachment draws nothing and owns role and value. |
| Reactive `.svelte.ts` scale as the one source | Met. `TimelineScale` wraps the pure maths and holds density plus scroll. |
| Browser pins across three engines, axe, focus order, value text | Met. The tracked spec pins pointer, keyboard, Escape, snap, no overlap, focus order, value text, and both gates. |
| Docs page plus demo route in the house pattern | Met. Both routes mirror the transcript pair, and scope plus README name the new key. |

## Findings

| Severity | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| H | `src/lib/timeline/handle.ts` near line 252 at the reviewed hash. | An untouched handle announces a stale time after a sibling handle edits the shared segment. The move handle shifts the demo segment from 1 to 2, then the focused start handle still reports 1.00 seconds. The module claims the handle owns the role, the value, and the spoken time. | A throwaway Playwright probe, kept out of the gate path. Focus the move handle, press Shift plus ArrowRight, and the segment reads 2.00 to 4.00. Focus the start handle, and its `aria-valuetext` must read 2.00 seconds. Before the fix it reads 1.00 seconds on Chromium and on Firefox. | Publish the live value on focus, for example one refresh line inside `onFocusIn`. Deleting that line reintroduces the defect, and the probe above turns red again. |
| M | `src/lib/timeline/edit.ts` near lines 202 and 214 at the reviewed hash. | A resize with a minimum longer than the span silently leaves bounds. Resizing start 2 end 5 with delta zero and minimum 10 against bounds zero to 10 returns start minus 5. The end edge variant returns end 12. The module promises the span stays inside bounds, and every other invalid input there throws. | A throwaway vitest probe, kept out of the gate path. It asserts the start result sits at or above zero and the end result sits at or below 10. Before the fix the results are minus 5 and 12. | Floor the minimum clamp at the room edge, so the room binds first. Restoring the bare clamp reintroduces the defect, and the probe above turns red again. |

## Review questions

1. **Did a Svelte 4 idiom slip in?** No. The leakage scan passed, and the new code uses runes
   throughout. No `export let`, no reactive label, no store.
2. **Does a module touch a browser global at import time?** No. The server safety probe
   imported the timeline key under plain node. Window and capture stay inside the attach
   and its handlers.
3. **Does a component carry a visual value?** No. The visual values scan passed. The library
   draws nothing, and the routes size their boxes inline only.
4. **Does the change, its issue, or its pull request name a consumer?** No. The consumer
   name scan passed, and the prose names no product.
5. **Does any code, comment or test cite a planning file or a private note, or did stripping
   one lose the reason it carried?** No. The plan reference scan passed. The attachment
   comment states the reactive effect reason in its own words.
6. **Does `docs/scope.md` still match what the change covers?** Yes. The Timeline section
   names the new key, and the not covered list no longer carries issue 40.
7. **Was this review run on the handed hash, in a worktree of its own?** Yes. Detached
   worktree at the hash above, confirmed with `git log -1`.

## Verdict

**REMEDIATE.** C 0, H 1, M 1, L 0. Both findings carry a probe and a one line mutation.
No verdict on anything outside `main...705bce7`.
