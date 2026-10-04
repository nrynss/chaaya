# Review: SvelteKit form-action helpers, issue 23, first round

- Reviewed hash: `378810f`, two commits on `50246f4`, the head of `main` at review time
- Worktree: `/home/nryn/work/chaaya-wt/issue-23-rev-r1`, detached, confirmed with `git log -1` before any work
- Reviewer: glm, first round on this branch

## What the commit carries

The `@nrynss/chaaya/sveltekit` subpath, as issue 23 asks. `failFromApiError()`, `errorFromApiError()`, and `toActionData()` turn an `ApiError` into SvelteKit form-action and error-page data. `actionStatus()` maps a failure onto a status SvelteKit accepts. The input is an `ApiError`, including a subclass, or a refused response plus body text plus the app's parser. `readApiError` moves out of the private `failure()` helper in core and ships on `@nrynss/chaaya/api`. The package gains the subpath export and an optional `@sveltejs/kit` peer, and the publish probe links that peer. Docs, a demo route with a server action, and 14 unit tests ride along. The second commit adds the docs index and README links.

## How I verified

- The `readApiError` extraction is behaviour-preserving. The body is the old private `failure()` with the same parameter order and the same try/catch, and `createApi` calls it, so the client path is unchanged. A parser throw, a parser miss, and a missing parser still land on `http_error`.
- The status table in `docs/form-actions.md` matches `actionStatus` line for line: an integer from 400 to 599 passes through, `timeout` maps to 504, `network` to 503, anything else to 502. The override range is validated before SvelteKit sees it, and the code is never rewritten. Tests pin all four branches and the three refused overrides.
- One response is read once per failure. `failFromApiError` resolves the `ApiError` a single time and passes it down, and the test counts parser reads.
- A `GateError` keeps its own code through the helpers. Input that is neither an `ApiError` nor a response pair throws `TypeError`. The entry files carry a source scan that refuses an adapter import.
- `uploadBlob` was not the only claim checked against sources. The `App.Error` augmentation snippet matches Kit 2's default error shape, and the demo action posts a fixed `ApiError` through the real helper.
- Issue acceptance: the three named helpers exist, the codes stay stable from client to action data, and there is no UI.

## Gate

Three runs, in order, on a clean install:

1. `./tools/check.sh` exit 1 at the webkit leg, `audio-capture.spec.ts:357` PCM startup, a length expectation. This branch touches no audio code. That leg is the known flake class on this workstation.
2. A re-run shared the machine with another full gate. It failed broadly across chromium, firefox, and webkit in the timing-sensitive audio and session-guard specs, and so did the other tree. That is contention, not evidence.
3. A solo re-run, nothing else on the machine: exit 0, `Every check passed.` That is the flake evidence the workstation convention asks for, and it exercised every step, including the publish probe with the new entry, the published api deferral at version 0.3.0, and both scans.

## The gate change

The probe step now links `@sveltejs/kit` into the unpacked tarball directory, so the new entry imports in a bare unpack. The failing side is inherent to the probe: it imports every exports key, and the sveltekit entry statically imports the peer, so an unresolved specifier fails the step. I demonstrated both sides outside the gate: the packed entry import throws `ERR_MODULE_NOT_FOUND` without the peer present, and imports cleanly with the link. The change is minimal and self-evidencing.

## Findings

None.

## The six questions

1. Svelte 4 idiom: none. No `export let`, no `$:`, no stores.
2. Browser global at import time: none. The helpers touch `Response` and read bodies only at call time, and the server-safety step imported every entry clean.
3. Visual value: none. The route reuses the token reference css.
4. Consumer names: none. The gate's scan ran clean.
5. Plan citations: none. The docs cite tracked paths only.
6. Hash and worktree: yes. A detached worktree of its own at the handed hash, confirmed before any work.

## Notes, not findings

- `readApiError` ships on `@nrynss/chaaya/api` and not on core. The body gives a stale reason, a file another branch edits, but the decision stands on its own: the api subpath is the natural home for a client-shaped read.
- `docs/errors.md` is edited here and on the scope branch. Different regions, but the shared-path rule applies: land one, rebase the other, re-gate. The same holds for the docs index and README across four open branches.
- This branch is the base of the job-stream-response branch. Land it first.

## Verdict

APPROVE, with zero findings. The gate history above records why three runs exist and which one counts.
