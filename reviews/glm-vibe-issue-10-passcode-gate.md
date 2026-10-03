# Review: passcode gate, issue 10, round 1

Written by GLM 5.3 Flash, a coding agent review. Like the other model notes on the sibling
branches, this file rides the branch and records one model's read. It is not a maintainer
approval.

- Hash reviewed: `f555d28059244ca54dfa7b247023c7cdab7c664e` (branch `issue-10-passcode`, 3 commits
  on `main` `ddc87c3`)
- Worktree: `/home/nryn/work/chaaya-wt/issue10-rev-r1` (detached at the hash)
- Spec: GitHub issue nrynss/chaaya#10, a gate passcode helper for `api()` (header plus cookie)
- Scope read: the full `main...f555d28` diff (11 files), `src/lib/auth/gate.ts` and both test
  files in full, `src/lib/core/api.ts` for the `ApiError` contract the wrapper builds on, the
  Keel adapter and its defaults, and the docs and route changes.

## What the gate measured in this worktree

`npm ci`, then `./tools/check.sh`, twice.

- Run 1, exit 1. svelte-check, eslint, the Svelte 4 leakage scan, the visual values scan, the Keel
  fixture byte diff, and the full vitest suite (224 tests, 31 files, including the new 8 core gate
  tests and 2 Keel gate tests) all passed. The Playwright leg failed one test: `[webkit]
  tests/playwright/audio-capture.spec.ts:305 a pcm take carries the generated markers`, with "the
  take lost the markers at 0.300s". 89 other webkit lines and every chromium and firefox line
  passed. The steps after Playwright did not run.
- Run 2, exit 1. The identical single failure, at the identical marker slot, with every other test
  green. All pre-Playwright steps green again.

The webkit project runs inside the pinned image on this workstation (`tools/check.sh` falls back
automatically), so I re-ran that one test through the gate's own fallback path against this hash:
`mcr.microsoft.com/playwright:v1.63.0-noble` with the static ffprobe pair. Two runs, two passes.
The test file is byte-identical to `main`'s, and the branch touches no test, no audio module, and
no route the test visits. I read the failure as suite-context timing on this workstation, not as a
defect of the branch.

Because `check.sh` stops at the Playwright step, I ran the remaining steps by hand in this
worktree: svelte-package, publint, the published-api check (deferred, no `api/0.3.0` record yet),
the published-types probe (unpacks the tarball, imports every export key including the new
`@nrynss/chaaya/auth`, and typechecks the barrels), the server-safety import of every key under
plain node, the consumer-name scan, and the plan-reference scan. All passed.

## Spec compliance (issue 10)

| Requirement | Verdict |
| --- | --- |
| Read and store a passcode | Met. `GatePasscode` holds it in memory and mirrors it into an optional cookie jar (`value`, `set`, `clear`). `set` refuses empty values and line breaks before they can reach a header or a cookie. |
| Inject the header on requests | Met. `apply()` adds the header when a value is stored and the caller has not set that header themselves. `credentials` is never set for the caller. |
| Optionally set the cookie from a response | Met. `remember()` reads `Set-Cookie` where the runtime still exposes it, otherwise the `passcode` member of a JSON body. In a browser the jar path (`jar: document`) is the way the cookie comes back. |
| Small helper on the api export | Met. `apiWithGate` wraps any `ApiClient`; the default is core `api`, and `apiWithKeelGate` wraps the Keel client so Keel's error parser still runs. |
| Keel's `X-Passcode` and `passcode` defaults | Met. `keelGate` fills the header, the cookie, and the `passcode_required` code. The generic class never names them. |
| Generic primitive, adapter fills the names | Met. `src/lib/auth/` names no backend. The 26-line Keel adapter is the documented reference shape. |

Also verified: `GateError` extends `ApiError` and copies every field the base carries (message,
code, status, detail, retryAfterSeconds), so `instanceof ApiError` still matches and nothing is
lost in the re-throw. The `authCodes` check is `Array.includes`, so a code named `constructor` or
`toString` is never an inherited match. That rule is pinned by a test that throws a `toString`
code.

## Findings

| Severity | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| L | `src/lib/auth/gate.ts` line 69 (comment on `readSetCookie`) and `docs/auth.md` line 43. | Both state the browser mechanism as "`getSetCookie` is missing". Current browsers implement `Headers.getSetCookie`. A browser fetch response returns `[]` from it because the browser strips `Set-Cookie` before script sees it (a forbidden response-header name), and `get("set-cookie")` is null for the same reason. The conclusion the code and docs draw, that `remember()` is inert in a browser and the body member or the jar is the path that works, is correct. The stated mechanism is wrong on every browser released since mid 2023. | The claims, verbatim: gate.ts "There `getSetCookie` is missing and `get(\"set-cookie\")` is null" and docs/auth.md "so `getSetCookie` is missing and `get(\"set-cookie\")` is null". A browser-mechanism read fails both by inspection. | Reintroduce either sentence. The behaviour itself (a browser `remember()` returns false for a real fetch response) is correct and pinned by the hidden-cookie test. |

## Review questions

1. **Did a Svelte 4 idiom slip in?** No. The leakage scan passed in both runs, and the branch adds
   no component and no reactive class. No runes were needed and none are missing.
2. **Does a module touch a browser global at import time?** No. The server-safety probe imported
   `@nrynss/chaaya/auth` under plain node and passed. `document` is only ever reached through the
   `jar` option, and the cookie store is built only when a jar is passed.
3. **Does a component carry a visual value?** No. The visual-values scan passed. The docs route is
   prose under the reference stylesheet.
4. **Does the commit name a consumer?** No. All three commit messages read. `docs/auth.md` speaks
   of "that backend" and names only Keel, which is the adapter's purpose.
5. **Does any code, comment or test cite a phase, a task, or a planning file?** No. The
   plan-reference scan passed. `README.md` points at the adapter guide by its public issue number,
   which the repository's own tracker resolves.
6. **Was this review run on the handed hash, in a worktree of its own?** Yes. Detached worktree
   `/home/nryn/work/chaaya-wt/issue10-rev-r1` at the hash above, confirmed with `git log -1`.

## Process notes

- The branch sits directly on `main` `ddc87c3`, so landing is a fast-forward after remediation.
- No commit carries a `Chaaya-Task` trailer. Same open owner decision as the kit-by-design branch.
- **Landing order matters.** This branch and the one-shot-upload branch both edit `package.json`
  (adjacent export map entries) and the README (adjacent prose bullets and docs lists). Whichever
  lands second needs a rebase, and the rebase must be re-gated before it lands.
- The gate's webkit fallback ran both times, so this round also re-proved the fallback path on
  this workstation.

## Observations, not findings

- `keelGate` treats an explicit empty string for `headerName` or `cookieName` as "use the default",
  while `GatePasscode` throws on an empty name. The adapter silently substitutes where the core
  refuses. Fine as sugar, but a sentence in the adapter docs would pin which is intended.
- `readCookie` does not unwrap an RFC 6265 quoted-string value, so a cookie the server wrote with
  quotes round-trips with its quotes. A passcode written through `set()` is percent-encoded and
  never hits this. Edge case for a server that quotes.
- `remember()` prefers the `Set-Cookie` line over the body member when a runtime exposes both.
  Reasonable ordering. Worth a sentence if a second backend ever emits both.
- The cookie is written with `Path=/` and `SameSite=Lax`. No `Secure`, which a plain-http origin
  needs to skip and an https origin could add. An option can wait for a second backend that cares.

## Verdict

**REMEDIATE.** 0 C, 0 H, 0 M, 1 L. The one finding is a two-sentence rewrite of a comment and a
docs paragraph. The gate evidence above is otherwise green, with the webkit leg measured as a
workstation flake. No verdict on anything outside `main...f555d28`.
