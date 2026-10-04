# Review: the SvelteKit job-stream response helper, issue 22, first round

- Reviewed hash: `ba1ad38`, one commit on `378810f`, the head of the form-actions branch
- Worktree: `/home/nryn/work/chaaya-wt/issue-22-rev-r1`, detached, confirmed with `git log -1` before any work
- Reviewer: glm, first round on this branch

## What the commit carries

`createJobStreamResponse()` on `@nrynss/chaaya/sveltekit`, as issue 22 asks. It takes frames as `NamedFrameFields` or as strings already written by `formatNamedFrame`, from a sync or async iterable, and returns a `text/event-stream` `Response` a `JobStream` or `createEventStream` can follow. Caller headers merge, `content-type` is forced, `cache-control` defaults to `no-cache` and can be replaced, and the writer stops when the signal aborts. The helper imports no `@sveltejs/kit`, so the response is a plain `Response` a `+server.ts` returns as-is. Docs, a live demo route with a real `+server.ts`, and 5 unit tests ride along. No Keel names anywhere, as the issue requires.

## How I verified

- The writer round-trips through the real reader. The tests write fields and pre-formatted text, then split and parse with `takeFrames` and `parseNamedFrame` from core, so the frames a `JobStream` would consume are the frames the tests consume.
- The header contract is pinned by tests: a caller's `content-type` cannot stick, `cache-control` can be replaced with `no-store`, and an extra header passes through.
- The abort contract holds. A pre-aborted signal yields an empty body. An abort mid-stream stops writes, and the test asserts the done frame never appears while tolerating scheduler timing on the frame count, which is honest about wall clocks.
- An iterable that throws surfaces through `controller.error`, the listener is removed in a `finally`, and a client cancel cannot double-close the stream.
- The demo `+server.ts` uses `request.signal` correctly and the page dumps the raw bytes, so the route exercises the real path with no UI kit.
- The fence in `docs/job-stream-response.md` typechecks as written: the async generator's yielded literals fit `NamedFrameFields`, and the handler signature matches Kit's `RequestHandler`.
- Issue acceptance: a documented `+server.ts` example, no framework UI, and no Keel assumptions in the generic helper. All met.

## Gate

Two solo runs, in order, on a clean install:

1. Exit 1 at the firefox leg, `audio-upload.spec.ts:141`, a chunked-upload streaming test timing out on a polled count. This branch touches no audio code. That leg is in the known flake family on this workstation.
2. A clean re-run: exit 0, `Every check passed.` Every step ran, including the publish probe with the peer link this tree inherits from its base, the published api deferral at version 0.3.0, and both scans.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| L | `docs/job-stream-response.md:42` at the reviewed hash | The what-this-is-not list joins two clauses with an em dash, against the documentation style rules. It is the only em dash in any of the five open branches. | `grep -n` for the em dash character in that file returns line 42. | Replace it with a full stop and the grep returns nothing. |
| L | `docs/job-stream-response.md:35` and `src/lib/sveltekit/stream.ts:10` | Both say to pass `request.signal` from the load. A `+server.ts` has no load. The signal lives on the `request` object the request handler receives, which the fence in the same doc uses correctly. The wording misdescribes where the value comes from. | `grep -n 'from the load\|server.ts. load' docs/job-stream-response.md src/lib/sveltekit/stream.ts` returns both lines. | Reword either line to name the request handler, and the grep misses it. |

## The six questions

1. Svelte 4 idiom: none. No `export let`, no `$:`, no stores.
2. Browser global at import time: none. `TextEncoder`, `ReadableStream`, and `Response` are constructed at call time, and the server-safety step imported every entry clean.
3. Visual value: none. The route reuses the token reference css.
4. Consumer names: none. The gate's scan ran clean on this tree.
5. Plan citations: none. The docs cite tracked paths only.
6. Hash and worktree: yes. A detached worktree of its own at the handed hash, confirmed before any work.

## Notes, not findings

- The branch sits on the form-actions head. Land that branch first, then rebase this one and re-gate, per the shared-path rule. The two branches also touch `docs/form-actions.md`, where this branch appends a related-work link.
- Without a signal, a client that drops the connection leaves the producer iterating until the next enqueue fails. The docs tell the caller to pass `request.signal`, and SvelteKit aborts that signal on disconnect. A `cancel()` hook that also flipped the write flag would close that gap without the caller's help.
- The abort test tolerates one or two frames rather than pinning one. That is the right call for a timing-sensitive assertion, and it still pins the load-bearing half, the absent done frame.

## Verdict

REMEDIATE, with two L findings. The gate is green, and both fixes are one-line rewords in docs and one comment.
