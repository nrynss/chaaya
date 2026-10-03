# Review: kit by design, issue 17, PR A, round 1

Written by GLM 5.3 Flash, a coding agent review. Like the mistral notes on the other branches,
this file rides the branch and records one model's read. It is not a maintainer approval.

- Hash reviewed: `ce59091a542d6a73a3e26b870d9f567b68f7d75f` (branch `issue-17-kit-by-design`, 14 commits on `main` `f06aab1`)
- Worktree: `/home/nryn/work/chaaya-wt/issue17-rev-r1` (detached at the hash)
- Spec: GitHub issue nrynss/chaaya#17, PR A (this issue, onto main, before the others)
- Scope read: the full `main...ce59091` diff (88 files), every changed module, all changed tests, the four tool scripts, and the old `src/lib/job`, `src/lib/wire`, `src/lib/api` sources on `main` for behaviour comparison.

## What the gate measured in this worktree

`npm ci`, then `./tools/check.sh`. Exit 0. The run included svelte-check, eslint, the Svelte 4
leakage scan, the visual values scan, the Keel fixture byte diff against the recorded tag, the full
vitest suite, the Playwright leg, svelte-package, publint, the published-api check (deferred: no
`api/0.3.0` record yet, package version strictly newer than every record), the packed-tarball import
and typecheck of every export key, the server-safety import of every export key, the consumer-name
scan, and the plan-reference scan. Exit codes: install 0, gate 0.

The mutation below ran in this worktree and the tree was restored (clean `git status --porcelain`
afterwards, 0 lines).

## Spec compliance (issue 17, PR A bullets)

| Requirement | Verdict |
| --- | --- |
| One generic SSE frame reader, no third `takeFrames` | Met. `takeFrames` and `parseNamedFrame` are defined once in `src/lib/core/sse/frame.ts`. The adapter wire imports them. One re-export wart is finding 3. |
| One reconnect schedule, the generic client owns the knob | Met. `ReconnectOptions`, `reconnectSettings`, `reconnectDelay` live in `core/sse/reconnect.ts`. Core `JobStream` accepts `reconnect`. The Keel adapter passes it through. Defaults 500/8000/6 unchanged. |
| `api()` takes an injected error parser | Met. `createApi({ parseError })` and per-request `parseError`. Generic codes stay `timeout`, `network`, `http_error`. A throwing parser keeps `http_error` (pinned by a core test). |
| Keel shapes out of generic files | Met. `src/lib/wire`, `src/lib/job`, `src/lib/api/client.ts` are gone. Envelope, `parseJobEvent`, `job_id`, status echo, terminal frames now live in `src/lib/adapters/keel/`. The chunked protocol (`beginBody`, `chunks/{n}`, `complete`, sha256) moved with them. |
| Adapter exported as its own subpath | Met. `./keel` in the exports map, source under `src/lib/adapters/keel/`. The server-safety probe imports it from the packed tarball. |
| Product-agnostic exports untouched | Met. `audio` keeps capture, playback, levels, peaks and no longer exports upload. `tokens`, `theme`, `guard`, `transcript`, `testing` unchanged. |
| Break called out in the release | Partly. The README has a "Migration from 0.2.4 to 0.3.0" table. It covers paths and the `api()` parser. It does not cover the reading-merge behaviour change, which is finding 1. |
| No `reviews/mistral-vibe-pr-*.md`, no PR #13 to #16 content | Met. No `reviews/` files, no `domain.ts`, no `passcode.ts`, no TopicStream in the tree. |

Also verified: the KEEL_TAG pin moved from `v0.1.1` to `v0.4.0` and every fixture file moved as a
pure rename (0 changed bytes), matching the issue's investigation that the shapes are unchanged at
Keel `v0.4.0`. The gate's fixture diff against `v0.4.0` passes on this machine.

## Behaviour comparison against 0.2.4

Compared line by line: `main:src/lib/job/job.svelte.ts`, `main:src/lib/job/follow.ts`,
`main:src/lib/wire/index.ts`, `main:src/lib/api/client.ts` against
`core/job/job.svelte.ts`, `core/sse/frame.ts`, `adapters/keel/wire/index.ts`, `core/api.ts`.

Preserved: the frame field loop (CR strip, colon split, one-space strip, integer id, multi-line
data join), the envelope and payload rules (job_id string, status echo, error envelope nesting), the
follower ordering rules (duplicate id, other job, post-terminal refusal), the reconnect constants
and doubling, refused-stream-fails-at-once, never-opened-fails, terminal-ends-watch, the catch-up
freshness rule (both guard lines are equivalent to the old `#latestProgress` scan), catch-up racing
against the read loop, and the whole `api()` client (timeout, network, Retry-After whole seconds,
decodeBody, joinSignals).

Changed (intended and pinned, but see finding 1 for the release note):

- **Merge instead of replace.** Old code assigned `stage`, `current`, `total` unconditionally from
  every progress frame and every snapshot, so an absent field cleared the published value.
  `mergeProgress` copies only present fields. Pinned by core tests. See the mutation below.
- **`Last-Event-ID` support.** New. Sent on reconnect when the last accepted id is not 0. An empty
  id line on an accepted frame resets it. Ignored and refused frames do not move it. The browser
  leg covers the cross-origin preflight the header forces. The fixture server answers OPTIONS now.
- **`requestInit` auth.** New. `accept` always overwritten, `signal` always owned by the stream.
- **`events` and the new `frames` list are read-only** through getters now. On 0.2.4 they were
  writable `$state` fields. No documented consumer wrote them.

Mutation that proves the merge rule is load-bearing: replace `mergeProgress`'s field-by-field copy
with `return { ...base, ...reading }`. Two core tests fail
(`progress merges defined fields and a missing name is ignored`,
`an opened stream that drops reconnects and reports the count`): stage and total clear to undefined
on a frame that omits them. Measured in this worktree, 2 failed / 20 passed, then reverted.

## Findings

| Severity | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| M | `README.md`, "Migration from 0.2.4 to 0.3.0". The delta lives in `src/lib/core/job/job.svelte.ts` `mergeProgress`. | The issue requires the break to be called out in the release. The migration table names paths and the `api()` parser change. It does not name the reading change. On 0.2.4 a progress frame or snapshot that omitted `current`, `total`, or `stage` cleared that published field to undefined. A `done` snapshot without them cleared the counter and stage the view showed. On 0.3.0 the last value stays. Keel producers can send stage-only progress frames, because `parseProgress` sets `current` and `total` only when present. The delta is therefore reachable. Core tests pin the new rule as intended. A consumer upgrading sees different rendering with no note. | `core/job/job.test.ts` pins the new rule, and the mutation below flips it. The 0.2.4 side is `main:src/lib/job/job.svelte.ts` `#accept` (`this.current = event.current`) and `#applySnapshot` (`this.current = snapshot.current`), unconditional assignments that clear. | In `mergeProgress`, replace the guarded copies with `return { ...base, ...reading }`. Two core job tests fail, proving the branch pins the new semantics while the README claims nothing changed for readers. |
| L | `src/lib/adapters/keel/upload/protocol.ts` (local `ok`, `fail`, `isRecord`, `decodeJson`) | The adapter carries its own copies of the decoder primitives that `core/result.ts` exports for exactly this use ("Shared decoder primitives for adapter authors"), while `adapters/keel/wire/index.ts` already imports them from core. The split was meant to end this duplication. | `grep -n "function ok\|function fail\|function isRecord\|function decodeJson" src/lib/adapters/keel/upload/protocol.ts` returns four local definitions. | Delete the four locals and import `ok`, `fail`, `isRecord`, `decodeJson` from `../../../core/result.js` (core's `decodeJson` returns `unknown`, so add the one `isRecord` check the local version inlines). The suite passes unchanged. |
| L | `src/lib/adapters/keel/job/follow.ts` re-export line | `export { takeFrames } from "../../../core/sse/frame.js"` survives only so the moved `follow.test.ts` can keep importing it from `./follow`. Nothing else imports it from there, no barrel re-exports it, and the issue demanded one home for the reader. | `grep -rn "takeFrames" src/lib \| grep -v core/sse` shows only this re-export and its test import. | Drop the re-export and import `takeFrames` from `../../../core/sse/frame.js` in `follow.test.ts`. Gate passes. |
| L | `docs/job-progress.md` line 169 and `src/lib/adapters/keel/job/job.svelte.ts` line 98 (comment) | Documentation style rule 1: no semicolons, split the sentence. Both files carry one. The quotes below are the evidence and stay verbatim. "…is not in this foundation; it lands separately." and "…the same accept set as raw named events; Keel views read this list." | `grep -n ";" docs/job-progress.md` and `sed -n 98p src/lib/adapters/keel/job/job.svelte.ts`. | Reintroduce either semicolon. A style read fails the rule by inspection. |
| L | `README.md` docs list: `[errors](docs/errors.md)`, `[job progress](docs/job-progress.md)` | New repo-relative links to markdown files that are not in the published package (`files: ["dist"]` only. README is force-included by npm). An npm consumer following the README hits dead links. The route links (`/docs/...`) are the pre-existing pattern. These two md links are new. | `npm pack` the tree and read the tarball listing: `docs/` is absent while README.md ships. | Reintroduce the links after removing the files from the repo. The packed README still names them. |

## Review questions

1. **Did a Svelte 4 idiom slip in?** No. The gate's leakage scan passed. My own greps: 0 `export let`,
   0 `$:` labels, 0 `svelte/store` imports under `src/lib`. Runes appear only in `.svelte.ts` files
   (`core/job/job.svelte.ts`, `core/sse/effect.svelte.ts`, `adapters/keel/job/job.svelte.ts`).
2. **Does a module touch a browser global at import time?** No. The server-safety probe imports every
   packed export key under plain node and passed. `window` is read only inside core `JobStream#connect`.
   Web Crypto, IndexedDB, and `AudioContext` touches sit in constructors and methods as before.
3. **Does a component carry a visual value?** No. The visual-values scan passed. The new
   `docs/job-progress` page renders structural markup under the reference stylesheet.
4. **Does the commit name a consumer?** No. All 14 commit messages read. None names a consumer
   project. The four consumer names are redacted from this tracked copy, because a tracked file may
   not carry them. Keel appears as the adapter's backend, which is its purpose.
5. **Does any code, comment or test cite a phase, a task, or a planning file?** No. The gate's
   plan-reference scan passed on the index and the tree, and I read every changed file. Comments
   state reasons themselves (for example, the Object.hasOwn and Last-Event-ID explanations).
6. **Was this review run on the handed hash, in a worktree of its own?** Yes. Detached worktree
   `/home/nryn/work/chaaya-wt/issue17-rev-r1` at `ce59091a542d6a73a3e26b870d9f567b68f7d75f`,
   confirmed with `git log -1`. The mutation ran there and was reverted. The tree is clean.

## Process notes for the orchestrator

- The branch sits directly on `main` `f06aab1`, so landing is a fast-forward after remediation.
- No commit carries a `Chaaya-Task` trailer and no phase file owns this work. Landing needs a task
  id to name in the trailers, or an owner decision that issue-based work lands without one.
- The gate's clean-clone triple rule belongs to the gate change (`check.sh`, `published-api.sh`,
  `freeze-api.sh`), not to this review. It should be measured before the release tag.

## Observations, not findings

- `./core`, `./api`, and `./sse` overlap: `./api` re-exports core's client and `./sse` re-exports
  core's SSE pieces. Both are documented API decisions that ease the 0.2.4 migration. Surface area
  to revisit at 1.0.
- Each accepted Keel frame is parsed three times (shouldAccept, frame handler, onAccept). The parse
  is pure and the payloads are small. Not worth complexity today.
- `asFrameAction` validates a terminal `reading` but not a terminal `error`'s shape. TypeScript
  callers cannot hit it. A JS caller could put a string in `stream.error`. Harden alongside the
  next core change if ever convenient.
- The docs "Another backend" example calls `stream.attach()` bare. It reads as module scope, but
  attach without a cleanup runner must run during component initialisation. One sentence would save
  a consumer the `$effect`-outside-root error.

## Verdict

**REMEDIATE.** 1 M, 4 L, 0 C, 0 H. Every finding is a documentation or duplication fix except the
M, which is a release-note addition naming the reading-merge change in the README migration section.
No verdict on anything outside `main...ce59091`.
