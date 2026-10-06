# Review: protocol asserts (#25) plus no-widget lint rule (#26)

Reviewed hash: `9481b7934d0a31dec8c6ae56bf4508eee340a522`
Worktree: `/home/nryn/work/chaaya-wt/multi-25-26-rev-r1` (detached HEAD, confirmed with `git log -1`)
Branch carrying the change: `multi-25-26-testing-gates` (same hash)

This file records one agent's read of the handed hash. It is not a maintainer approval. I did not write this change, I committed nothing, and I fixed nothing. All probes I made were deleted.

## What the diff holds

Two commits, `main...9481b79`, ten files, 349 insertions, 8 deletions:

1. `316a702` protocol asserts (issue 25). New `src/lib/testing/protocol.ts` with `assertSseFrame`, `assertErrorEnvelope`, `assertJobProgress`, new `src/lib/testing/protocol.test.ts` (13 cases), export wiring, and sample runs on the docs testing route.
2. `9481b79` no-widget rule (issue 26). New `no-restricted-syntax` block in `eslint.config.js` covering static imports, re-exports, and lazy imports of stylesheets and component files under `src/lib/core`, plus renames of three test imports to the explicit form, plus README and `docs/scope.md` lines.

## Gate and pins

- `tools/` diff is empty. The triple clean-clone rule applies to gate changes only, so it does not apply. Claim verified directly.
- `npm ci` passes. `./tools/check.sh` reached the browser leg with 180 passed and 3 skipped. Fast steps verified independently with exit codes: svelte-check 0 errors, lint clean, svelte4-leakage clean, visual-values clean, full vitest 46 files and 371 tests all pass.
- `src/lib/testing/protocol.test.ts`: 13 passed of 13.
- `npm run lint` clean, and self made violation probes prove the new rule is load-bearing: stylesheet imports, component imports, re-exports, and lazy imports fail in core while reactive module imports pass. Probes deleted, tree clean.

## Contract fidelity

- `assertSseFrame` mirrors `src/lib/core/sse/frame.ts` exactly, including the `idSet` and `resetId` flag rules and comment versus event field exclusivity.
- The Last-Event-ID prose matches `src/lib/core/sse/loop.svelte.ts` and `docs/scope.md`.
- `assertErrorEnvelope` matches `src/lib/core/error.ts` and the envelope form in the Keel adapter.
- `assertJobProgress` matches `src/lib/core/progress.ts` and the map semantics in `src/lib/core/job/job.svelte.ts`.

## Findings

No findings.

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| (none) | | | | |

A `?raw` suffixed import would not match the selector. Recorded as a non-finding observation: a raw-text import is neither a component use nor a stylesheet application, so it sits outside the rule intent, and no core file does it.

## Process note (not a finding)

`AGENTS.md` prefers one issue per change. This combined review was handed over as authorized under the owner override. Noted, not blocking.

## The seven questions

1. Did a Svelte 4 idiom slip in? No.
2. Does a module touch a browser global at import time? No.
3. Does a component carry a visual value? No.
4. Does the change, its issue, or its pull request name a consumer? No.
5. Does any code, comment, or test cite a planning file or a private note, or did stripping one lose the reason it carried? No.
6. Does `docs/scope.md` still match what the change covers? Yes.
7. Was this review run on the handed hash, in a worktree of its own? Yes. `9481b79` in `/home/nryn/work/chaaya-wt/multi-25-26-rev-r1`, detached, no edits, no commits.

## Commit-message style

Both messages use short sentences, active voice, no semicolons, no em dashes. Issue parentheticals are expressly allowed. Compliant.

## Verdict

Severity counts: C 0, H 0, M 0, L 0. No OUT_OF_SCOPE rows. Round one with no prior rounds.

APPROVE, with the explicit claim of zero residue: this round leaves no finding of any severity against either commit.
