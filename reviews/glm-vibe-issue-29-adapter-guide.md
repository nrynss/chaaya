# Review: the non-Keel adapter guide, issue 29, first round

- Reviewed hash: `c66f57b5f4a13a868f026d1621042d81887526e8`, one commit on `dd29d09`, the head of `main` at review time
- Worktree: `/home/nryn/work/chaaya-wt/issue-29-rev-r1`, detached, confirmed with `git log -1` before any work
- Reviewer: glm, first round on this branch

## What the commit carries

Docs and one example, as issue 29 asks. `docs/adapters.md` is the guide. `docs/examples/plain-adapter.ts` is the copy-pasteable adapter, importing only the core and auth subpaths. A unit test pins the guide fence to that file with the specifiers swapped, and drives the parser, the map, the writer, and a live `JobStream` over a stubbed fetch. The README, `docs/auth.md`, `docs/job-progress.md`, and three doc routes carry the cross links. `src/lib/core/index.ts` gains two comment lines and no export change.

## How I verified

I read every behavioural claim in the new docs against the sources at the reviewed hash. The strongest checks:

- The rewritten restart paragraph is now true. `JobStream` has no replay drop, so a repeated id applies again (`src/lib/core/job/job.svelte.ts`, the accept path). `createEventStream` drops a positive id at or below its cursor (`src/lib/core/sse/events.svelte.ts`, the replay check on accept). The old text claimed the job stream drops restarted ids, which was wrong.
- A handler throw is caught in the loop before the cursor moves (`src/lib/core/sse/loop.svelte.ts`, the dispatch guard).
- `shouldAccept` runs before the map, `onAccept` runs only after a progress or terminal action, an unknown kind degrades to ignore, and `Object.hasOwn` gates the map (`src/lib/core/job/job.svelte.ts`).
- `fetchState` runs only after the response opens, a rejection leaves the stream alone, `prepareState` rewrites in the same turn, and `isTerminal` sees the reading only (`src/lib/core/sse/loop.svelte.ts` connect order, `src/lib/core/job/job.svelte.ts` catch-up).
- `accept` is forced to `text/event-stream`, a caller's `Accept` loses, and the stream owns the abort (`src/lib/core/sse/loop.svelte.ts`, the fetch init builder).
- The writer returns one frame ending in the blank line, splits a multi-line payload into data lines, throws on a bad id or a line break in the name, and the reader never throws and joins data lines with `\n` (`src/lib/core/sse/frame.ts`).
- `GatePasscode` throws on an empty name, `apply` sets only the header, `authCodes` is a plain list read with `includes`, and `apiWithGate` wraps any client (`src/lib/auth/gate.ts`). `keelGate` substitutes defaults for empty strings and `plainGate` does not (`src/lib/adapters/keel/gate.ts`), exactly as the guide says.
- Every Keel path the guide cites exists and behaves as cited. `src/lib/adapters/keel/gate.ts`, `wire/index.ts` on the same decoder primitives, `job/map.ts` with `keelFrameMap` and `keelShouldAccept`, `api.ts` with `keelErrorParser`, and a Keel `JobStream` that wraps the core stream.
- Every export the example imports exists on the two subpath exports it names.
- The guide fence is byte-identical to the example file with the two specifiers replaced. I checked with a node script before the gate ran, and the new unit test enforces it after.
- Issue acceptance: the adapter is complete and imports no Keel. No second README exists, so the package README section is the adapter section, which the PR body discloses.

## Gate

Commands, in the review worktree, on a clean install:

- `npm ci`, exit 0.
- `./tools/check.sh`. I captured the output through `tail -40`, so I record what the step order proves. The script runs `set -euo pipefail` and stops at the first failing step. The output reached the plan-references step, second to last. So every earlier step exited zero. Those steps are svelte-check, eslint, the Svelte 4 leakage scan, the visual-value scan, the Keel fixture diff, vitest with the new test, chromium and firefox bare, webkit in Docker, svelte-package, publint, the published api check, the tarball import and typecheck, server safety, and consumer names. The plan-references step printed its blocked list and the final banner never printed, so that step exited 1.

The block is not this commit's. The scan lists two tracked files the branch inherits from `main`:

```
reviews/glm-vibe-issue-10-passcode-gate-round[3].md
reviews/glm-vibe-issue-11-oneshot-upload-round[3].md
```

The brackets are the scan-safe split this repository's own gate file uses. The real names carry the digit straight after the word. Each of the two files cites its earlier sibling by path on line 9, and that sibling path holds the hunted token. The scan branch that matches carries no prefix guard, so the substring fires anywhere in any tracked file. The two files landed on `main` in `82479d0` and `d07cdf1`. Every clean clone of `main` now fails the gate at that step, and no branch off `main` can show a green gate until it is fixed. A one-line reword in each file clears it. The house pattern already exists in the sibling files: cite the earlier review by commit hash, and spell the round with a space.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| OUT_OF_SCOPE, H | Under `reviews/` on `main` at `dd29d09`: the issue 10 and issue 11 round[3] review files, line 9 of each. Introduced by `82479d0` and `d07cdf1`. | Each file cites its round[2] sibling by path, and that path holds the digit-adjacent token the plan-reference scan hunts. The gate blocks on a clean clone of `main` before any PR diff is judged, so no branch off `main` lands with a green gate. | In this worktree, `./tools/check.sh` blocks at plan references listing both files. `grep -lE 'round[0-9]'` over the two files returns both, one hit each, at line 9. | After a fix, restore the digit-adjacent spelling on line 9 of either file and the scan blocks again. |
| L | `src/lib/core/index.ts:8` at the reviewed hash, shipped as `dist/core/index.d.ts:8` and `dist/core/index.js:8` | The exported comment names `docs/adapters.md` as the guide. The published tarball carries only `dist` and `README.md`, so the file the comment names is absent from the artifact the comment ships in. The README section and the rendered docs page still reach a reader, which is why this is polish. I judge the pointer real rather than house style, because the sentence ships in an artifact that cannot resolve it. | `npx svelte-package -o dist` in the worktree, then `grep -n 'docs/adapters' dist/core/index.d.ts` prints a hit at line 8. `npm pack --dry-run` lists no `docs/` entry among the 158 files. | Delete the sentence from the source comment and the dist hit disappears. That shows the pin measures that sentence. |

The out-of-scope row names its owner: the two review files on `main`. It never blocks an approve. It blocks every landing until a one-line reword lands there.

## The six questions

1. Svelte 4 idiom: none. The new route uses `$state`. Nothing in the diff writes `export let`, `$:`, or a store-driven read. The leakage scan passed.
2. Browser global at import time: none. The example is pure functions and a class, and the server-safety step imported every entry clean. The demo page touches the DOM only in `onMount`.
3. Visual value: none. The route reuses the token reference css the sibling doc pages use. The visual-value scan passed.
4. Consumer names: none in the commit message, the docs, the example, or the tests.
5. Plan citations: none added. The commit replaces the two stale issue-29 pointers it promised to replace. The blocked scan step is residue on `main`, recorded above as out of scope.
6. Hash and worktree: yes. A detached worktree of its own at the handed hash, confirmed with `git log -1` before any work.

## Notes, not findings

- `plainCatchUp` maps `again` to `retryable` on error frames and reads no `again` on a catch-up document. The guide defines the state document without `again`, so code and docs agree. If the example grows, the two paths could share that mapping.
- `plainJobStream` translates the state document on its own promise. The core types warn against wrapping when a caller needs the reading in the same turn. Keel's wrapper does the same on purpose, and nothing in the example needs a same-turn reading.
- The `job-progress` fence names handlers the guide defines, and the link above the fence says so. A copy-paste reader takes the full file from the guide.

## Verdict

REMEDIATE, with one L finding of this PR's own. The out-of-scope row records the blocked scan step on `main`. It never blocks an approve, and it blocks every landing until a one-line reword lands there.
