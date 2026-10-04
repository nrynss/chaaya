# Review: the protocol scope page, issue 30, first round

- Reviewed hash: `9616ba1`, one commit on `50246f4`, the head of `main` at review time
- Worktree: `/home/nryn/work/chaaya-wt/issue-30-rev-r1`, detached, confirmed with `git log -1` before any work
- Reviewer: glm, first round on this branch

## What the commit carries

`docs/scope.md` with a what-covers and what-does-not contract, a `/docs/scope` route, a README section, a docs index link, and cross-links from the adapters, errors, job-progress, and upload pages. Docs only, as the issue asks. No code and no release.

## How I verified

- Every bullet in the issue is on the page: streaming as named SSE over fetch with no WebSocket and no native `EventSource`, the job loop split between `JobStream` and `createEventStream` on one `FrameLoop`, the `Last-Event-ID` contract, both upload shapes with no resumable direct-to-storage, one typed `ApiError` with adapter-owned envelope parsing, and Svelte 5 only.
- The transport claims match the sources. The client sends `Last-Event-ID` on reconnect only when the cursor is not 0 and never on the first connect. A kept event frame with an id line moves the cursor, an empty `id:` line or `id: 0` resets it, and a comment with an id line moves nothing, the deliberate WHATWG deviation. `JobStream` applies a repeated id again and `createEventStream` drops one at or below its cursor. All of that is what the loop and frame sources do.
- `Uploader` is `start` / `append` / `finish`, and `uploadBlob` and `uploadBlobWithProgress` exist on the upload subpath, as the page states.
- The page states both halves of the contract. The out-of-scope list names WebSocket, native `EventSource`, invented backend clients, resumable direct-to-storage, a UI kit, and non-Svelte frameworks.
- Issue acceptance: one page a newcomer can read, cross-links, and both sides stated.

## Gate

One solo run on a clean install: exit 0, `Every check passed.` Nothing contends, every step ran, including all three browser engines, the publish probe, and both scans.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| L | `src/routes/docs/wire/+page.svelte` and `src/routes/docs/job/+page.svelte`, absent lines | The issue asks for cross-links from the core and the Keel docs. The four pages that got links are the core-side docs. The Keel-side pages, the wire route and the job route, carry no scope link, so the acceptance is half met. | Read the two route files and search for a scope link. Neither carries one. `grep -rn 'scope' src/routes/docs/wire src/routes/docs/job` returns nothing. | Add a scope link to either route and the pin stops returning nothing. |
| L | `README.md`, the protocol scope section, and `src/routes/docs/scope/+page.svelte` | Three prose semicolons against the documentation style rules. The README joins two clauses of the job-loop bullet with one. The route page joins two more pairs: the reconnect sentence and the error-envelope sentence. | `grep -n '; ' README.md src/routes/docs/scope/+page.svelte` shows the three prose lines. The sibling doc routes carry none. | Restore any one of the three and the grep finds it again. |

## The six questions

1. Svelte 4 idiom: none. The route uses `$state` and nothing else.
2. Browser global at import time: none. The route touches the DOM only in `onMount`.
3. Visual value: none. The route reuses the token reference css.
4. Consumer names: none. The gate's scan ran clean on this tree.
5. Plan citations: none. The doc drops the issue numbers the proposal carried and cites tracked paths only.
6. Hash and worktree: yes. A detached worktree of its own at the handed hash, confirmed before any work.

## Notes, not findings

- The framework paragraph names form actions among the optional SvelteKit helpers. On this branch the sveltekit module does not exist yet, because it lands with the form-actions branch. The sentence becomes true at that landing, so landing that branch first or in the same sequence keeps the page honest.
- The README scope section sits above the exports list with one extra blank line after it. Cosmetic only.
- This branch and the form-actions branch both edit `docs/errors.md` and `README.md`, in different regions. The shared-path rule still applies: land one, rebase the other, re-gate.

## Verdict

REMEDIATE, with two L findings. The gate is green, and both fixes are lines in docs and one-line route edits.
