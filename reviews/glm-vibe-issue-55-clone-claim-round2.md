# Review, issue 55, round two

- Reviewed hash: `bfcc80b05dab4b15ad584a701e7324bd520000a7`, confirmed with `git log -1`.
- Base: `origin/main` at `63ad06071b6efbcca2948a39e7a5ccf1b1bd6bf4`.
- Review worktree: `/home/nryn/work/chaaya-wt/issue-55-rev-r2`, detached at the handed hash,
  created for this review.
- This file records one agent's read. It is not a maintainer approval.
- I am a fresh agent. I did not write any part of this change. I differ from the round-one
  reviewer. I fixed nothing and committed nothing.

## The change

Three commits on the base, all by the author. The first replaces one sentence in the issue 50
review record with three. It separates the build and import risks a fresh clone carries, which
stay unreachable from a gate diff, from the test-selection side, which is reachable and
measured by the recorded clones. The second adds the round-one review file for this issue. The
third rewords one clause so it names a project instead of one test.

The diff from the round-one hash to the handed hash touches the two review files only. I
verified this with a name-only diff between the two hashes.

## The round-one finding, re-measured

Round one recorded one L at line 64 of the issue 50 record. The clause "and this change adds
one" read as one test. I ran the round-one pin myself.

- `git show 0350b37 -- tools/check.sh` shows the fallback line gains `--project=firefox-sink`
  beside chromium and firefox.
- `playwright.config.ts` defines the `firefox-sink` project with
  `testMatch: "**/audio-playback.spec.ts"`. That spec holds 9 tests.

The fixed clause reads "and this change adds a project to that selection". That is exactly what
the gate diff did. The project carries the whole playback spec, so the round-one reading was
right and the fix answers it. The fix is precise. The round-one L is resolved by commit
`bfcc80b` in `reviews/glm-vibe-issue-50-sink-fallback.md`.

## Pins I ran

### The gate at the handed hash

I extracted the scan function from `tools/check.sh` at the reviewed hash and ran its fourth
invocation, the plan-reference scan, verbatim over the same file list the gate uses. It exited
1 and named one file.

```
Blocked. These tracked files match a forbidden pattern:
reviews/glm-vibe-issue-55-clone-claim.md
```

The match sits on line 60. That line names the issue 50 second-round review by path, and the
quoted name carries a round token followed by a digit, which the scan forbids. The first three
scans, two for consumer names and two for plan file names, returned clean over the same list.

### CI

- Run `37266329887` on the round-one hash `8198229` passed.
- Run `37267454364` on the handed hash `bfcc80b` failed. The gate job died in the plan
  references step with exit 1 and named `reviews/glm-vibe-issue-55-clone-claim.md`. The CI log
  and my local verbatim run agree.

The failure arrived with the round-one review file, added in `4926d81` after round one reviewed
`8198229`. At `8198229` that file did not exist, so round one's clean scan claim holds for the
hash it reviewed.

### Style

The diff since the round-one hash carries no semicolon and no dash of either kind. The fixed
sentence runs 24 words in active voice. The colon in it is allowed. The commit message obeys
the same rules.

### The other checks

The passage at lines 62 to 65 of the issue 50 record states both sides. The build and import
pair is named unreachable. The test-selection side is named reachable and measured by the
record below it. This change edits review records only, so the clean-clone bar for gate changes
is not due. My own review file is untracked in this worktree. After writing it I reran all four
scans over the worktree. The only hit is the tracked round-one file, which finding 1 records.
My file appears in no scan output, so it adds no forbidden token.

## Findings

| # | Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|---|
| 1 | H | `reviews/glm-vibe-issue-55-clone-claim.md:60` | The round-one review file quotes a sibling review record by path, and the quoted name carries a round token followed by a digit, which the plan-reference scan forbids. The gate fails at the handed hash and CI is red on the pull request head, so the pull request cannot land. A commit that fails its own gate does not exist. | Run the fourth scan invocation from `tools/check.sh` verbatim at the reviewed hash. It exits 1 and names this file. CI run `37267454364` failed in the plan references step with the same output. | Remove the quoted sibling path from line 60 and name that record without the round suffix. Rerun the scan and see it pass. Restore the line to bring the failure back. |

Severity counts: C 0, H 1, M 0, L 0.

No finding in this review is recorded as a false positive.

## The seven questions

1. Did a Svelte 4 idiom slip in? No. The diff touches no Svelte file.
2. Does a module touch a browser global at import time? No module was added or changed. The
   diff is markdown only.
3. Does a component carry a visual value? No component was touched.
4. Does the change, its issue, or its pull request name a consumer? No. I read the diff, the
   commit messages, the issue, and the pull request. Both consumer-name scans returned clean
   over my worktree.
5. Does any code, comment or test cite a planning file or a private note, or did stripping one
   lose the reason it carried? Yes, in one place, and it is finding 1. The round-one review
   file carries a round identifier the scan forbids. Nothing else matched, and no stripped
   reference lost a reason.
6. Does `docs/scope.md` still match what the change covers? Yes. The change edits record
   wording only. It adds, removes, and narrows no library coverage, so `docs/scope.md` needs no
   update.
7. Was this review run on the handed hash, in a worktree of its own? Yes. Detached worktree at
   the handed hash, confirmed with `git log -1`. The worktree stayed clean throughout. I
   committed nothing anywhere.

## Verdict

REMEDIATE.

Severity counts: C 0, H 1, M 0, L 0.

Round-one residue, severity by severity: C 0, H 0, M 0, L 0. The single round-one L is resolved
by commit `bfcc80b` in `reviews/glm-vibe-issue-50-sink-fallback.md`, verified against the
round-one pin.

The new finding sits in the round-one review file, which arrived after round one reviewed its
hash. The gate and CI fail on the pull request head, so no approval is possible at this hash. A
remediator must fix finding 1 as new commits on the reviewed commit. A fresh agent re-reviews
round three.
