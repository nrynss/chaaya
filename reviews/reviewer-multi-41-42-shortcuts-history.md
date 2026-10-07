# Review: multi-41-42 shortcuts plus history

Reviewed hash: `eb9071a1334e2305b00c992c732f4427f0f53191`
Worktree: `/home/nryn/work/chaaya-wt/multi-41-42-shortcuts-history` (branch tip, confirmed before reading and after all runs)
Branch: `multi-41-42-shortcuts-history`. Two commits. No prior review files for issue-41 or issue-42 exist under `reviews/`.

This file records one agent's read, not a maintainer approval. I did not write this change, I committed nothing, and I fixed nothing.

## Scope

Commit `3c8d953` adds the keyboard shortcut registry on `@nrynss/chaaya/shortcuts`. It holds bindings with stable id, keys, scope, description, and handler. The dispatcher skips editable targets without opt-in, maps Mod per platform, matches by key with code fallback, nests scopes, and throws on double registration. It adds the docs page that renders its help list from the registry, the harness route, the browser spec, the export key, and the scope updates.

Commit `eb9071a` adds the edit history on `@nrynss/chaaya/history`. Entries are apply plus invert pairs with coalescing keys and a transaction helper. The sync layer sends pending edits in order with the parent revision through a caller supplied commit function. Conflict pauses the queue and exposes the head for rebase or discard. Proposals wait apart and acceptance adds one undoable entry. It adds the docs page, the harness route with its commit route, the browser spec, the export key, and the scope updates.

## Gate and pins run in this worktree

- `npm ci`: exit 0. `./tools/check.sh`: exit 0. Vitest 413 passed (49 files). Playwright green on chromium, firefox, and firefox-sink, plus webkit green inside the pinned image.
- `npx vitest run src/lib/shortcuts/shortcuts.test.ts`: 15 passed. `npx vitest run src/lib/history/history.test.ts`: 15 passed.
- `tests/playwright/shortcuts.spec.ts`: green on chromium and firefox. `tests/playwright/history.spec.ts`: green on chromium and firefox.
- Reviewer pin against `/docs/shortcuts`: dispatch `new KeyboardEvent("keydown", { key: "?", code: "Slash", shiftKey: true, bubbles: true })` on the document, then read `demo-help`. Output before any fix: `0`. Control with `shiftKey: false`: `1`. The pin ran as the gitignored probe spec `author/shifted-glyph.probe.ts` through the probe Playwright config.

## Findings

| Severity | Where | What | Pin | Mutation |
|---|---|---|---|---|
| C | `src/lib/shortcuts/shortcuts.ts:110` at `eb9071a` | A binding on a shifted glyph can never fire from real hardware. Physical Shift plus slash produces keydown with key `?` and Shift held, but the modifier match demands Shift off when the binding names no modifiers, so the match always misses. The whole shifted glyph class is dead, and hardware Shift plus K against a plain `k` binding also misses. The shipped spec passes only because Playwright synthesizes `?` with Shift off, which real hardware never sends. The shipped suite measured synthesis rather than behaviour. | Reviewer probe above: hardware event leaves `demo-help` at `0`, control reaches `1`. | Restore the bare exact Shift comparison by removing the forgiveness guard: the hardware pin fails again while every shipped test stays green, which proves the pin is load-bearing and the shipped suite cannot see the defect. |

## Seven questions

1. Did a Svelte 4 idiom slip in? No. 2. Does a module touch a browser global at import time? No. 3. Does a component carry a visual value? No component ships. 4. Does the change, its issue, or its pull request name a consumer? No. 5. Does any code, comment or test cite a planning file or a private note? No. 6. Does `docs/scope.md` still match what the change covers? Yes. 7. Was this review run on the handed hash, in a worktree of its own? Yes.

## Verdict

Severity counts: C: 1, H: 0, M: 0, L: 0. REMEDIATE. The C row blocks approval. No zero-residue claim is made.
