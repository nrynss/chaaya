# Review: issue-31 direct multipart upload

Reviewed hash: `239ee13065a6ed1d55ed3b96c4993c91b00f0ac8`
Worktree: `/home/nryn/work/chaaya-wt/issue-31-rev-r1` (detached HEAD, confirmed before reading and after all runs)
Branch: `issue-31-direct-upload`. One commit. No prior review files for issue-31 exist under `reviews/`.

This file records one agent's read, not a maintainer approval. I did not write this change, I committed nothing, and I fixed nothing.

## Owner terms check

Caller supplied URLs, raw body, no auth header, real progress, backend agnostic session, documented boundary, shared path reuse. All pass against the diff and the pins.

## Gate and pins run in this worktree

- `npm ci`: exit 0. `./tools/check.sh`: exit 0. Vitest 383 passed (47 files). Playwright 241 passed plus webkit 111 passed.
- `npx vitest run src/lib/direct-upload/direct-upload.test.ts`: 12 passed.
- Browser spec per project: 3 passed on chromium, 3 passed on firefox, 3 for 3 on webkit in the gate.
- Multi-project pin: `npx playwright test tests/playwright/direct-upload.spec.ts --project=chromium --project=firefox --reporter=list` gives 2 failed, all-project run gives 3 failed, each project alone passes. Shared-store contention proven.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| M | `tests/playwright/direct-upload.spec.ts:28-30` at `239ee13` | The serial guard orders cases only within one project, but `fullyParallel: true` runs this file's chromium, firefox and webkit copies concurrently against one global in-memory harness store. Running the cited pin standalone across projects fails, while the full gate passes by scheduling luck. The comment's claim is false across projects. | Multi-project run gives 2 failed, all-project run gives 3 failed, each project alone passes 3 for 3. | Change `test.describe.serial(` to `test.describe(`: the single-project run then fails 3 for 3, proving the pin measures shared-store contention. |

## Seven questions

1. Did a Svelte 4 idiom slip in? No. 2. Does a module touch a browser global at import time? No. 3. Does a component carry a visual value? No component ships. 4. Does the change, its issue, or its pull request name a consumer? No. 5. Does any code, comment or test cite a planning file or a private note? No. 6. Does `docs/scope.md` still match what the change covers? Yes. 7. Was this review run on the handed hash, in a worktree of its own? Yes.

## Verdict

Severity counts: C: 0, H: 0, M: 1, L: 0. REMEDIATE. The M row blocks approval. No zero-residue claim is made.
