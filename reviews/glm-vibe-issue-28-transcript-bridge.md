# Review: the transcript-to-SSE word bridge, issue 28, first round

- Reviewed hash: `a3de0a2`, two commits on `50246f4`, the head of `main` at review time
- Worktree: `/home/nryn/work/chaaya-wt/issue-28-rev-r1`, detached, confirmed with `git log -1` before any work
- Reviewer: glm, first round on this branch

## What the commit carries

`createTranscriptBridge()` on `@nrynss/chaaya/transcript`, as issue 28 asks. It folds a generic timed-word stream into the `TranscriptWord[]` the editor is constructed with. A frame is a comment, a `doneEvent`, one word, or a snapshot. Field failures return `invalid` and leave the list alone. A payload that is not a word is `ignore`. An optional `parse` hook names foreign fields at the edge. `ordered()` sorts a copy by start, then end, then arrival. A demo route and `docs/transcript-stream.md` carry the wiring. The second commit adds the docs index and README links.

## How I verified

- The word rules hold against the code: finite `start` and `end` with `end >= start`, a string `text`, an optional string `speaker`, and an integer `index` that revises below the length, appends at the length, and refuses a gap. Tests pin each branch, including a backwards span and a bad snapshot that leaves the list alone.
- The `doneEvent` tension is real and documented truthfully. The bridge honours `done` even when its own `events` list omits it. `createEventStream` does not: its filter refuses a name before the terminal check runs. The docs put the done name in both lists, and the route repeats it.
- The `{ words: [...] }` snapshot cannot masquerade as a word: an object that is both returns `invalid` with reason `both`, and the test pins it. `snapshots: false` turns both snapshot shapes into `ignore`.
- A throwing or null-returning `parse` cannot clear the list, and `apply` after `done` ignores frames until `reset`. Both are tested.
- The editor contract is untouched. `TranscriptWord` is `start`, `end`, `text`, and an optional `speaker`, the editor takes a readonly array, and the test constructs a real `TranscriptEditor` from `bridge.ordered()`.
- Issue acceptance: a generic input shape, no editor change, and a documented adapter example. All met.

## Gate

Two runs, in order, on a clean install:

1. A run that shared the machine with another full gate failed broadly across the timing-sensitive audio and session-guard specs in both trees. That is contention, not evidence.
2. A solo re-run got through svelte-check, eslint, both leakage scans, the fixture diff, vitest, all three browser engines, packaging, publint, the published api check, the tarball typecheck, and server safety, and then blocked at consumer names: `docs/transcript-stream.md` matches a forbidden pattern. Exit 1.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| H | `docs/transcript-stream.md:5` at the reviewed hash | The doc names a consumer in a tracked file. Line 5 lists what the bridge does not import, and the list holds Keel, a consumer name this repository scans for, and the editor. The consumer-name scan is case-insensitive over every tracked file and fails the gate on it, so no landing can carry this tree. My diff read missed the name and the scan caught it. I quote it here without the name, because the scan reads this file too. | `./tools/check.sh` on a clean install exits 1 at the consumer-names step listing that file. `git grep -i` for the name returns exactly that line. | Delete the name from the sentence and the scan passes. Re-add it and the gate blocks again. |

The fix is to drop the name from the sentence. Keel alone carries the same meaning there, since the editor is the other named thing and the scan has no quarrel with it.

## The six questions

1. Svelte 4 idiom: none. The bridge is plain TypeScript closures, and the route uses `$state`.
2. Browser global at import time: none. The bridge touches nothing, and the demo page builds it in `onMount`.
3. Visual value: none. The route reuses the token reference css.
4. Consumer names: one, recorded as the finding above. The gate's scan ran and blocked on it.
5. Plan citations: none. The docs cite tracked paths only.
6. Hash and worktree: yes. A detached worktree of its own at the handed hash, confirmed before any work.

## Notes, not findings

- The snapshot result exposes the live array, but every later mutation replaces the array instead of editing it, so a reference a caller kept stays frozen at what it saw.
- The empty snapshot, `[]` or `{ words: [] }`, clears the list. The docs say a snapshot replaces the list, and an empty list is a list. Worth a sentence if the example grows.
- The docs index and README are edited here and on three other open branches. The shared-path rule applies at landing.

## Verdict

REMEDIATE, with one H. The gate is red on a clean clone at the consumer-names step, and the fix is one word in one sentence.
