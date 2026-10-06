# Review, issue 58 follow ups

This file records one agent's read of the change. It is not a maintainer approval.

- Reviewed hash: `03e28b3ec5369566f754eb54aa338effff1a6f0e`, confirmed with `git log -1`. The
  branch carries two commits, `a23d459` and `03e28b3`.
- Base: `origin/main` at `55b08c9`, the merge of the timing hardening.
- Pull request: #59, closing #58.
- Worktree: `/home/nryn/work/chaaya-wt/issue-58-rev-r1`, a detached worktree of its own. An
  older checkout of the same name sat parked at the first commit, so I removed it and recreated
  the worktree at the handed hash before anything ran.
- Tree state: clean at the reviewed hash. `npm ci` ran before any pin. Every mutation below was
  reverted and confirmed clean with `git status --porcelain`.
- Host load during this review: about 3 to 5, read from `/proc/loadavg` beside each run.
- CI: the required `gate` check on the pull request concluded SUCCESS (run 37421532583,
  5m24s) on the handed hash. The CodeRabbit check passes and is not required.

## What I verified

### The dying transfer keys per repeat

Six repeats of the truncation check on the sink leg all passed.

```
npx playwright test --project=firefox-sink tests/playwright/audio-playback.spec.ts \
  --grep "dies mid play" --repeat-each=6
```

6 passed, 0 failed, 12.8 seconds, exit 0. Log at `/tmp/rev58-trunc6.log`.

A pass alone proves nothing here, because a 502 refusal classifies as network too. So I wrote a
probe that reads the response log and measures the shape. It lives at
`probes/issue-58-rev/trunc-shape.spec.ts` in the gitignored probes directory, beside a copy of
the repository probe config, and it drives the harness page with the same fill the check makes.
Each repeat records every status the page receives for trunc.wav, in order.

Run this from inside the worktree's gitignored probes directory, where the config sits.

```
npx playwright test --config probe.config.ts issue-58-rev/trunc-shape.spec.ts \
  --repeat-each=3 --workers=1
```

3 passed, exit 0, and the same command with the full config path produced identical lines on the
first run (`/tmp/rev58-probe.log`, rerun log `/tmp/rev58-probe2.log`). The probe's own lines:

```
PROBE repeat=0 statuses=[200,502,502]
PROBE repeat=1 statuses=[200,502,502]
PROBE repeat=2 statuses=[200,502,502]
```

Each line's first entry is the mid play dying 200, and the rest are the engine's own follow up
asks receiving the refusals. The probe also prints each response's URL, and every one carries
that repeat's number in the query.

The probe is load bearing in both directions. I applied the one line reverse mutation, the
attempt only key the branch replaces, and reran the probe. Result, from
`/tmp/rev58-probe-mut.log`:

```
PROBE repeat=0 statuses=[200,502,502]
PROBE repeat=1 statuses=[502,502]
PROBE repeat=2 statuses=[502,502]
```

2 failed, 1 passed, exit 1. Under the old key the second and third repeats open on the 502 and
measure the weaker shape, which is the defect this change closes. I reverted the mutation and
confirmed the tree clean.

### The epsilon rounding on both sides

Node measures the artifact class and the guard against it.

- `node -p "Math.abs(0.18 - 0.2)"` prints `0.020000000000000018`, and
  `node -p "Math.abs(0.18 - 0.2) <= 0.02"` prints false. The raw comparison fails a boundary
  value on representation.
- `node -p "Number(Math.abs(0.18 - 0.2).toFixed(6))"` prints `0.02`, and the same comparison
  with the rounding prints true.
- A genuinely wide spacing still fails. `node -p "Number(Math.abs(0.121 - 0.1).toFixed(6))"`
  prints `0.021`, which sits past the bound either way.
- For completeness, `Math.abs(0.12 - 0.1)` prints `0.01999999999999999` on this node, which
  passes both ways. The issue's recorded `0.020000000000000004` came from the loaded run's
  measured spacing, and the 0.18 case reproduces its shape exactly.

The rounding is load bearing against real signal loss. I added `slot % 4 !== 3` to the marker
condition in `tests/playwright/support/audio/input.ts:161`, so the signal drops every fourth
marker, and ran the fixed spacing check on two engines.

```
npx playwright test --project=chromium --project=firefox \
  tests/playwright/audio-support.spec.ts --grep "fixed spacing"
```

2 failed, one per engine, exit 1. Log at `/tmp/rev58-support-mut.log`. The rounded comparison
still catches a missing marker, so the headroom never masks substance. I reverted the mutation
and confirmed the tree clean.

### The postscript on the timing review record

The postscript makes three claims, and all three hold in the tree.

1. Commit `07fd670` exists, titled to match, and both startup checks carry its three attempt
   retry. The compressed startup check at `tests/playwright/audio-capture.spec.ts:348` holds the
   loop at line 384, and the owned context startup check at line 395 holds the loop at line 432.
   Each loop starts at attempt one, stops before attempt three, and halts once a take passes its
   judgement.
2. The second round review file exists under `reviews/` and verifies both fixes. It records the
   retry shape as fixed, and the describe half of the depth finding as matching main.
3. The verdicts are unchanged. The diff against main adds eight lines to that file, the
   postscript alone. REMEDIATE stands, the severity counts stand, and the out of scope row
   stands as written.

One wording check passed too. The postscript says the commit restored the describe's depth,
which is exactly what the second round file verifies for that commit. It does not claim the
whole depth finding closed there, and the third round file records the sibling half closing
later under `cf1b10c`.

### The diff boundary

`git diff origin/main...03e28b3 --name-only` returns exactly five files:

- `reviews/glm-vibe-issue-52-53-54-timing-hardening.md`
- `src/routes/tests/audio-playback/media/[name]/+server.ts`
- `tests/playwright/audio-playback.spec.ts`
- `tests/playwright/audio-support.spec.ts`
- `tests/playwright/audio-upload.spec.ts`

33 insertions, 20 deletions. The first commit carries the repeat key and three rounding sites,
the second adds the wide gap predicate the second bot review caught. The commit split matches
the pull request's story.

### The gate

`./tools/check.sh` in this worktree ran end to end, exit 0, log at `/tmp/rev58-gate.log`.

- svelte-check, eslint, the Svelte 4 scan, the visual values scan and the keel fixture compare
  passed.
- vitest: 309 passed.
- WebKit cannot launch on this host, so the gate said so and ran chromium, firefox and the sink
  leg bare: 211 passed. WebKit ran inside the pinned image with the static ffmpeg pair: 96
  passed.
- svelte-package, publint, the published api check, the published types probe, the server safety
  guard, the consumer names scan and the plan references scan all passed. The run ends with
  `Every check passed.`

No step failed, so nothing needed attribution.

### CI

The required `gate` check on pull request #59 concluded SUCCESS in 5m24s, run 37421532583, and
the run's head SHA is the handed hash. Both CI runs on the branch are green.

## Findings

Zero. I record no findings at any severity: C 0, H 0, M 0, L 0. This is the first review pass on
this pull request, so there are no earlier rounds to claim residue against.

## Out of scope

| Severity | Where | What | Pin | Owning path |
|---|---|---|---|---|
| L | `tests/playwright/audio-support.spec.ts:142` | The gap pair's aligned onset comparison reads `Math.abs(gapAligned - fullAligned)` raw against `MARKER_TOLERANCE_SECONDS`. It is the one comparison left against that constant without the six decimal rounding this change gives the four spacing comparisons. I measured no failure there, and the aligned difference clusters at zero rather than at the bound, so the exposure is weaker than the spacing sites the issue recorded. It is still the same one ulp class on the same constant. | `node -p "Math.abs(0.18 - 0.2) <= 0.02"` prints false and `node -p "Number(Math.abs(0.18 - 0.2).toFixed(6)) <= 0.02"` prints true, the shape this line shares. No measured failure in six gate passes of this family, including mine. | `tests/playwright/audio-support.spec.ts`, the gap pair judgement. It becomes its own issue. |

## Judged not defects

- The truncation key set grows one entry per repeat and attempt and never clears. One test
  drives the name, the config sets no retries, and every invocation restarts the server, so no
  key collides. The second round review judged the same shape before repeats existed.
- An absent query param falls back to zero, so a caller that omits the repeat gets the old per
  attempt shape. Only this check drives the name, and it always fills both numbers.
- Rounding at six decimals is a fixed epsilon, not a scale free one. The reader quantizes onsets
  to five millisecond windows, so representation noise sits far below one microsecond, and my
  mutation run proves genuine marker loss still fails.
- The 502 refusal body stays a plain text body with no audio header, unchanged from main.

## The seven questions

1. Did a Svelte 4 idiom slip in? No. The diff touches no Svelte component. The gate's leakage
   scan passes on this tree.
2. Does a module touch a browser global at import time? No. The one server module in the diff
   builds its wav bytes at the top and reads the request URL inside the handler. The server
   safety guard passes.
3. Does a component carry a visual value? No colours, fonts, shadows or spacing values anywhere
   in the diff. The visual values scan passes.
4. Does the change, its issue, or its pull request name a consumer? No. I searched the diff, the
   issue and the pull request description. The consumer names scan passes.
5. Does any code, comment or test cite a planning file or a private note, or did stripping one
   lose the reason it carried? No. The new comments state their reasons themselves. The
   postscript names commits and files by words. The plan references scan passes on this tree,
   and I scanned this file against the gate's own patterns before finishing.
6. Does `docs/scope.md` still match what the change covers? Yes, and it needs no update. The
   change covers test tooling, one media route and one review record. It adds, removes or
   narrows no library coverage.
7. Was this review run on the handed hash, in a worktree of its own? Yes. Detached at
   `03e28b3`, confirmed with `git log -1`. Clean before and after every mutation, confirmed with
   `git status --porcelain`. The review file sits untracked in that worktree, as handed.

## Verdict

APPROVE.

Severity counts: C 0, H 0, M 0, L 0, plus one out of scope row at L that becomes its own issue.

Both fixes do what the issue and the pull request claim, and each is load bearing in both
directions on my own measurements. The repeat key change turns a pass that could ride the weaker
502 shape into a pass that provably lands the dying transfer once per repeat. The rounding
removes a false failure at the bound without masking real marker loss. The postscript corrects
the record and leaves every verdict as written. The gate passes end to end in a clean worktree,
and CI's gate check passes on the handed hash.
