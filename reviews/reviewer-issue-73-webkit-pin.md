# Review: the marker gap pin, issue 73, first round

- Reviewed hash: `4a7cd36`, one commit on `2e7f5f2`, the head of `main` at review time
- Worktree: `/home/nryn/work/chaaya-wt/issue-73-rev-r1`, detached, confirmed with `git log -1` before any work
- Reviewer: reviewer, first round on this branch
- This file records one agent's read, not a maintainer approval

## What the commit carries

The marker clip gains a second beep one second after the first. The harness reads both onsets from the captured mix. The pin asserts the gap between them in sample counts instead of the absolute onset. Start latency moves both onsets together, so it cancels out of the comparison.

## How I verified

- I read the diff against `main` in full. The scheduler is untouched. The skipped set and seek past pins are untouched.
- I ran `npm ci` then `./tools/check.sh` to green on the reviewed tree. Chromium and firefox pass bare. Webkit passes in the gate image leg.
- The gap reads exact on all three engines: 48000 of 48000 on chromium and firefox, 44100 of 44100 on webkit. The absolute onset still drifts with load, which is why the pin no longer asserts it.
- Mutation check: moving `BEEP_TWO_AT` by 0.1 seconds shifts the measured gap by that amount and the pin fails. Restoring it turns the pin green again.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| L | `src/routes/tests/clip-preview/+page.svelte:78-80` at the reviewed hash | The warming comment still claims the beep lands on its offset sample. Issue 73 shows webkit missing that sample by 37350 under load, and this change drops the absolute pin for that reason. | Read the comment against the new pin: the pin asserts the gap, while the comment promises the absolute sample. Reword it and the claim matches the pin. | Restore the offset sample wording and the comment contradicts the pin again. |

## The seven questions

1. Svelte 4 idiom: none. The harness uses runes, and the change touches comments plus detection only.
2. Browser global at import time: none. The harness builds its context inside the gesture.
3. Visual value: none. The harness draws nothing new.
4. Consumer names: none. The gate consumer scan passes on the reviewed tree.
5. Plan citations: none. Comments cite the pin and tracked paths only.
6. Scope match: yes. No scope change was needed, and none landed.
7. Hash and worktree: yes. A detached worktree of its own at the handed hash, confirmed before any work.

## Verdict

REMEDIATE, with C 0, H 0, M 0, L 1. One stale comment, already fixed above in spirit.
