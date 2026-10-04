# Review: the transcript-to-SSE word bridge, issue 28, second round

- Reviewed hash: `0f88ff6`, the remediation commit on the rebased branch. Base `59c5c7c`, the merge-base with `main` at rebase time.
- Worktree: `/home/nryn/work/chaaya-wt/issue-28-rev-r2`, detached, confirmed with `git log -1`
- Reviewer: glm, second round on this branch
- Round-1 file: `reviews/glm-vibe-issue-28-transcript-bridge.md` at `5aa8a07`

## Rebase integrity

`git range-diff 50246f4..a3de0a2 6893c57..b634bea` reports `=` on both reviewed commits. The reviewed patches are byte-identical through the rebase, so the remediation is the only new code.

## Round-1 findings, one round later

- **H, the stream doc names a consumer**, fixed. Line 5 now reads that the bridge does not import Keel or the editor, and the consumer name is gone. The consumer-names scan step, run by the gate's own code on this tree, is clean.
- **Note, the empty snapshot**, addressed. `docs/transcript-stream.md` now says an empty snapshot is still a snapshot and clears words already applied, which is what the code does.

## A correction to round 1

The round-1 file answers the plan-citation question with none, on the strength of a hand-run scan. That scan was bash syntax executed under zsh, the loop inside it never ran, and the clean verdict printed unconditionally. The plan-references finding below existed at the round-1 hash, and the round-1 evidence could not have seen it. I record the correction here because the round-1 verdict rested on that evidence.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| H | `src/lib/transcript/stream.test.ts:104` and `:108`, present since the round-1 content commit | The plan-reference scan blocks on this file. The custom-parse test names its fields with a letter t and a digit, and a `t` followed by a digit at a word boundary is the exact shape the scan's identifier branch hunts, so the gate is red on a clean clone at the plan-references step. The fields are not a plan citation, they are test-local names, but the scan is the gate and the gate is red. | The gate's own plan-references step, run on this tree, lists that file and exits 1. `grep -nE 't[0-9]' src/lib/transcript/stream.test.ts` shows both lines. | Rename the fields, for example `tStart` and `tEnd`, and the scan passes. Restore those two field names and the gate blocks again. |
| OUT_OF_SCOPE, L | The generated-signal audio specs, owned on `main` | The same machine flake recorded on the recording-session branch hit this tree too: one full gate run lost four audio legs across chromium and firefox, a different set from the other tree's runs. Nothing in this branch touches audio. | The run matrix in the recording-session round-2 file covers both trees, including a bare `main` worktree failing the same class of leg. | Load alone flips these legs between green and red. |

## Gate

One full run on a clean install: exit 1 at playwright, with four audio-leg failures across chromium and firefox, all in the generated-signal family that is failing machine-wide today. Every step before playwright passed, including svelte-check, vitest with the 12 bridge tests, and the fixture diff.

Because playwright blocked the tail steps, I ran the gate's own code for everything after it by hand on this tree: svelte-package, publint, the published api check at version 0.3.0, the packed-tarball import and typecheck probe, server safety, and the consumer-names scan, which is clean and closes the round-1 H. The plan-references step is the blocked one in the finding above.

## The six questions

1. Svelte 4 idiom: none in the remediation.
2. Browser global at import time: none.
3. Visual value: none.
4. Consumer names: none. The scan is clean on this tree, which closes the round-1 finding.
5. Plan citations: one, the finding above, in the shape of two test-local field names.
6. Hash and worktree: yes. A detached worktree of its own at the handed hash.

## Verdict

REMEDIATE, with one H of this branch's own: rename two field names in one test so the plan-reference scan passes. It existed at round 1, where my own broken scan hid it. The round-1 H is fixed and verified.
