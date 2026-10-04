# Review: the headless recording session, issue 27, first round

- Reviewed hash: `d1751a5`, two commits on `50246f4`, the head of `main` at review time
- Worktree: `/home/nryn/work/chaaya-wt/issue-27-rev-r1`, detached, confirmed with `git log -1` before any work
- Reviewer: glm, first round on this branch

## What the commit carries

`createRecordingSession()` on `@nrynss/chaaya/audio`, as issue 27 asks. The phase table is one pure function over seven phases and eight events. The controller takes two ports, `RecordingCapture` and `RecordingUpload`, and grows no DOM, no CSS, and no Keel import. `captureFromRecorder` adapts `AudioRecorder` and omits pause and resume on purpose. A demo route and `docs/recording-session.md` carry the wiring. The second commit adds the docs index and README links.

## How I verified

- The phase table in the docs matches `nextRecordingPhase` move for move, and the phase test sweeps the whole phase by event cross product with a no-op default, so an unlisted move cannot drift.
- The race scheme holds. `start` and `stop` bump a generation counter, so a cancel or reset during the grant window, during `capture.stop()`, or during `upload.send()` turns the loser into `RecordingCancelled` and releases the device. Pause and resume read the counter without bumping it. Tests pin cancel during opening, cancel and reset during upload, and a second start as `busy`.
- The docs claims about the real recorder check out against `src/lib/audio/capture/`: the grant table is `idle`, `requesting`, `recording`, `stopped`, `denied`, `failed`, `start()` resolves on a refused grant and sets `denied` or `failed` without throwing, and `reset()` bumps the session counter, so a late grant is released and re-reset. `BlobUploadOptions` carries `filename` and `signal`, and `Uploader` is `start` / `append` / `finish` as the docs say.
- The public table exception is documented where it lives: cancel from `idle` during arming lands on `cancelled` through one marked branch in `cancel()`.
- I ran the two session test files myself: 21 tests, all pass. The controller is runtime-correct.

## Gate

- `npm ci`, exit 0.
- `./tools/check.sh`, exit 1 at the svelte-check step, on a clean install. The steps before it passed. Nothing after it ran on this tree.
- The two errors sit in one file and are the same shape:
  - `src/lib/audio/session/session.ts:179:8`, the types `"idle"` and `"failed"` have no overlap
  - `src/lib/audio/session/session.ts:255:8`, the types `"recording" | "paused"` and `"failed"` have no overlap
- Both are the `if (phase === "failed") throw cause` lines in the `start` and `stop` catch blocks. TypeScript narrows the closure variable after the early guard throws and cannot see the mutation through `settle()`, so it reads the comparison as impossible. At runtime it is live and load-bearing: the failure branches settle `failed` before throwing, and this line keeps the catch from failing the session a second time.
- I ran the consumer-name and plan-reference scans over the tracked tree by hand, since the aborted gate never reached them. Clean.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| H | `src/lib/audio/session/session.ts:179` and `:255` at the reviewed hash | The gate is red on a clean clone. svelte-check rejects both comparisons as impossible, so no landing can carry this tree. The behaviour is correct at runtime, the types are not. | `npm ci` then `./tools/check.sh` in a clean clone exits 1 at svelte-check with the two errors above. `npx vitest run src/lib/audio/session/` passes 21 tests, which shows the split between runtime and types. | Fix both sites so svelte-check passes, then restore the bare comparison on either line and the error returns. |
| M | `docs/recording-session.md`, the wiring fence, and the same shape in the route's example string | The headline copy-paste fence does not typecheck in a strict app. `uploadBlob<T>` takes `T` only in its return position, so the call infers `unknown`, and `Promise<unknown>` is not assignable to the `Promise<void>` the `send` port wants. Nothing in the repo compiles the fence, and the route and the tests each define their own `send`, so the gate cannot see it. | Under strict TypeScript, `const port: { send(): Promise<void> } = { send: (r, s) => uploadBlob("/u", new Blob(), { signal: s }) }` fails with TS2322, `Promise<unknown>` is not assignable to `Promise<void>`, even with the contextual type in place. | Await the call in a block body, or pass the type argument (`uploadBlob<void>`), and the fence compiles. Restore the bare arrow and TS2322 returns. |

## The six questions

1. Svelte 4 idiom: none. The session, phase, and port files are plain TypeScript with no reactivity claims. The demo route uses `$state`.
2. Browser global at import time: none. The controller touches nothing, the ports take the browser work as parameters, and the demo page builds its session in `onMount`.
3. Visual value: none. The route reuses the token reference css the sibling pages use.
4. Consumer names: none. I ran the consumer-name scan over the tracked tree by hand.
5. Plan citations: none. The docs cite tracked paths only.
6. Hash and worktree: yes. A detached worktree of its own at the handed hash, confirmed before any work.

## Notes, not findings

- The PR body says the docs index is deliberately not updated because another branch edits it. The branch's own second commit updates the index and README, which is the better state. The body paragraph is stale, not the code.
- `stop()` notifies listeners twice while `uploading`, once on settle and once after `result` is set. A subscriber sees the phase twice and reads `session.result` for the bytes. Harmless, worth knowing.
- Four other open PRs edit the same docs index and README. This branch lands first or rebases, and the shared-path rule applies.

## Verdict

REMEDIATE, with one H and one M of this PR's own. The H blocks the gate on a clean clone and must land first in any remediation round.
