# Review of the timing hardening, the third pass

This file records one agent's read of the change. It is not a maintainer approval.

- Reviewed hash: `39d5135c28f2a19cb1d50a2a670378e61231aec4`, confirmed with `git log -1`.
- Base: `origin/main` at `89c484b`. Pull request 57, closing issues 52, 53 and 54 in one landing
  at the owner's request.
- Worktree: `/home/nryn/work/chaaya-wt/issue-52-53-54-rev-r3`, a detached worktree of its own.
- Reviewer: a fresh agent that did not write the change and did not write the first or the second
  pass. It differs from both earlier reviewers by session.
- Tree state: clean at the reviewed hash. The one mutation below was reverted and the tree was
  confirmed clean with `git status --porcelain`.
- Host load during this review: 8 to 22.5, read from `/proc/loadavg` beside each run. That is the
  condition the change exists for.

## What this pass verified

### The second pass first finding, the nesting residues

Fixed in commit cf1b10c. In `tests/playwright/audio-capture.spec.ts` the `a granted microphone`
describe sits at column zero (line 303), the mode loop sits one tab in (304), the takes test sits
two tabs in (305), and its whole body including the skip and the budget sits three tabs in (306
through 315). The four sibling tests sit one tab in (348, 395, 443, 461), and the describe close
sits at column zero (468). Reading those lines with `cat -A` confirms the tabs. The close matches
its open, and no sibling sits level with its parent any more.

### The second pass second finding, the startup budgets

Fixed in commit cf1b10c. `grep -n "test.setTimeout" tests/playwright/audio-capture.spec.ts`
returns lines 315, 353, 398, 635 and 660. The compressed startup check at 348 carries the 90
second budget at 353, and the owned context startup check at 395 carries it at 398. Each carries
a comment that states why three attempts need the long budget.

### The startup checks on this tree

Both startup checks ran once per engine on this hash, under load 8.3 to 10.6:

```
npx playwright test --project=chromium --project=firefox tests/playwright/audio-capture.spec.ts \
  --grep "startup preserves"
```

4 passed, 0 failed, 17.0 seconds. Each attempt spent 3.1 to 5.4 seconds, so no run came near the
retry loop's third attempt. The tree is sound.

### The mutation spot-check

I applied the pull request table's first mutation myself: `source.stop(cut + 3600)` in
`src/lib/audio/playback/stream.svelte.ts` at line 110, the deferred flush stop the first pass
describes. The flush check failed on chromium and firefox. I reverted the edit and confirmed the
tree clean. The pins bind on this tree.

## Gate evidence

`npm ci` then `./tools/check.sh` in this worktree, exit 0. Log at `/tmp/rev-r3-gate.log`.

- svelte-check, eslint, the Svelte 4 scan, the visual values scan, the keel fixture compare and
  vitest (309 tests in 39 files) all passed.
- WebKit cannot launch on this host, so the bare leg ran chromium, firefox and the sink project:
  211 passed, 3 skipped. WebKit ran inside the pinned image with the static ffmpeg pair: 96
  passed, 11 skipped. The webkit leg ran under load above 20 and still passed whole.
- svelte-package, publint, the published api check, the published types probe, the server safety
  guard, the consumer names scan and the plan references scan all passed. The run ends with
  `Every check passed.`

## CI on the handed hash

The CI run for the reviewed hash is 37371221138. Its first attempt of the `gate` job failed in
15m1s without running any step. GitHub's annotation reads `The job was not acquired by Runner of
type hosted even after multiple attempts`. That is a hosting infrastructure failure, not a
measurement of the change. I requested one rerun of the failed job and record its state below.

- The rerun (job 111973903394) concluded success in 5m20s. It ran the gate's own full browser
  sequence on the reviewed hash and passed.

The second pass recorded the required `gate` check successful on the earlier hash (run
37367605882). The only code commit after that hash is cf1b10c, which carries the two L fixes, and
my own worktree gate passed on the head with every step.

## Findings

None. I record zero findings at every severity: C 0, H 0, M 0, L 0. I record no out of scope
rows. The first pass out of scope row stays open as issue 58 and does not belong to this pull
request.

## The seven questions

1. Did a Svelte 4 idiom slip in? No. The changed page uses `$state` and `$effect`. No `export
   let`, no `$:`, no store import. The gate's own scan passes on this tree.
2. Does a module touch a browser global at import time? No. The diff touches two harness pages,
   one server route, one node fixture and five spec files. No `src/lib` module changes. The route
   reads the request URL inside its handler. The server safety guard passes.
3. Does a component carry a visual value? No. The gate's visual values scan passes, and I read
   the diff for one.
4. Does the change, its issue, or its pull request name a consumer? No. I searched the diff, the
   three issues and the pull request description. The gate's consumer names scan passes.
5. Does any code, comment or test cite a planning file or a private note, or did stripping one
   lose the reason it carried? No. The new comments state their reasons themselves. The gate's
   plan references scan passes on this tree. I scanned this review file with the same patterns
   before finishing, and it matches none of them.
6. Does `docs/scope.md` still match what the change covers? Yes, and it needs no update. The
   change covers test tooling, two harness pages, one media route and one fixture. It adds,
   removes or narrows no library coverage.
7. Was this review run on the handed hash, in a worktree of its own? Yes. Detached at `39d5135`,
   confirmed with `git log -1`. Clean before, between and after the mutation, confirmed with
   `git status --porcelain`.

## Verdict

APPROVE.

Severity counts: C 0, H 0, M 0, L 0. No out of scope rows.

Zero residue against every earlier finding, severity by severity:

- **First pass M**, the startup checks without a retry. Fixed in commit 07fd670, in
  `tests/playwright/audio-capture.spec.ts`. Both startup checks carry the same three attempt
  shape as the takes test. Each holds one closed over judgement, judges every attempt with it,
  and judges the last take again outside the loop, uncaught. The second pass proved the shape
  with its second mutation and 40 ordered repeats. On this tree the loops sit at lines 336, 384
  and 432, my four startup runs passed under load, and my spot-check confirms the mutation table
  still binds.
- **First pass L**, the describe's depth. Fixed across commits 07fd670 and cf1b10c, in the same
  file. The describe sits at column zero, its close matches its open, and the sibling tests sit
  one tab in.
- **Second pass first L**, the nesting residues inside the granted microphone block. Fixed in
  commit cf1b10c, in the same file. The takes test body sits three tabs in under a two tab test
  opener, and the four sibling tests sit one tab in under a column zero describe. Verified line
  by line with visible whitespace.
- **Second pass second L**, the missing 90 second budgets on the startup checks. Fixed in commit
  cf1b10c, in the same file. Both startup checks carry `test.setTimeout(90_000)` with a comment
  that states the reason.

The bundle holds together. Each issue's fix stays separable in the diff. The verification runs
passed on a host loaded to 8 through 22.5, which is the regime the three issues describe. My own
gate passed end to end on the head. CI's first gate attempt never ran a step, so it measures
GitHub's runner pool and not this change. Its rerun of the same job passed on the reviewed hash.
