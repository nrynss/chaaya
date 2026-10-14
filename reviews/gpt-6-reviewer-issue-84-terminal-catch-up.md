# Independent review of issue #84

Reviewed hash: `eebd4bb06222b6cd036ff150fa9dda2758d152f3`.
Worktree: `/home/nryn/work/chaaya-wt/issue-84-rev-r1`.

This file records one independent agent's read. It does not record maintainer approval.
I wrote no implementation commit. I own this review file alone.
The required shapes exist. This change can be validated independently.

## Finding

| Severity | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| L | `package-lock.json:2943`, `package-lock.json:2984`, `package-lock.json:3`, `package-lock.json:9` | Release metadata misstates installed dependency versions and the root package version. `npm ci` installs both dependencies at 0.4.1, while the lock claims 0.4.2. Its root fields still claim 0.4.0 against package.json 0.4.2. | After `npm ci`, run `node /tmp/chaaya-review84-lock-pin.cjs "$PWD"`. The independent installed-manifest comparison reports four mismatches and exits 1. Correct metadata makes the same probe print `[]` and exit 0. | Starting from consistent metadata, change each dependency version from 0.4.1 to 0.4.2. The same probe exits 1 with both mismatches. |

The dependency errors enter in this diff. The stale root fields predate it, but this release should synchronize its own version record.
This is polish because installation follows unchanged resolved URLs and integrity hashes. Restore both dependency versions and update only the two root version fields.
The probe reads installed package manifests independently of lockfile claims. It uses `node:assert/strict` to require zero mismatches.
The local copy remains available at `/tmp/chaaya-review84-lock-pin.cjs` while this review remains open.

## Verification

`git log -1 --format=%H` confirmed the handed hash.
I read `git diff main...eebd4bb` and the issue body, its comment, and pull request #85.
I read the repository protocol, project description, scope, modified implementation, adapter preparation, and test coverage.

`npm ci` exited 0.
`npx playwright test tests/playwright/job.spec.ts --project=chromium --project=firefox` exited 0 with 34 passed.
Those production-browser pins observe rendered readings, browser cancellation, server abort, and request counts.
They cover terminal states, lower counters, error fields, initial catch-up, stale readings, and foreign jobs.

I changed `if (!terminal && latest !== undefined)` to `if (latest !== undefined)` temporarily.
`npx playwright test tests/playwright/job.spec.ts --project=chromium --grep 'a done catch-up with|a count-free done'` exited 1 with three failures.
Count-free reconnect, lower-counter reconnect, and count-free initial catch-up all retained running state.
I restored the exact handed implementation before the full gate.

`diff -qr api/0.4.1 api/0.4.2` exited 0. Public declarations remain byte-identical.
No gate file changed, so the clean-clone triple-run rule does not apply.
The owner explicitly waived the live microphone and device check for 0.4.2.

`npm ci` followed by `./tools/check.sh` exited 0.
The gate passed 467 Vitest tests, 324 host browser tests, and 152 container WebKit tests.
Sixteen existing browser cases stayed skipped. All packaging, declarations, type imports, server safety, and policy guards passed.
The full gate log remains at `/tmp/chaaya-review84-gate.log`.
The mandatory gate does not detect the metadata finding above.

## Required questions

1. Did a Svelte 4 idiom slip in? No. The change uses the existing rune class and introduces no Svelte 4 reactivity.
2. Does a module touch a browser global at import time? No. The changed implementation evaluates callbacks during catch-up only.
3. Does a component carry a visual value? No. The test page adds text observations without styling.
4. Does the change, its issue, or its pull request name a consumer? The diff, current issue body, and pull request do not. A historical issue comment contains source-app context.
5. Does code, a comment, or a test cite private planning? No. The changed comment states the behavioral reason directly.
6. Does the written scope still match coverage? Yes. The fix changes existing headless job following and adds no coverage category.
7. Did this review run on the handed hash in its own worktree? Yes. The hash and worktree appear above. Temporary mutations were restored.

## Verdict

**REMEDIATE**.

Finding counts: C 0, H 0, M 0, L 1.
Prior review residue: C 0, H 0, M 0, L 0. There is no prior round for this issue.
No independently pinned out-of-scope behavioral defect was found.
The terminal catch-up implementation satisfies the tested acceptance. The release metadata finding remains open.
