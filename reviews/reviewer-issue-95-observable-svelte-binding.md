# Review: framework-neutral observable and the Svelte binding

Reviewed hash: `90c0e4c301d9fb6b4b3121bf18c8b99561ce262e`.
This file records one agent's adversarial read of the change. It is not a maintainer approval.

## Scope read

`src/lib/core/observable.ts` (`Listener`, `Observable`, `Notifier`) and its core export. `TimelineScale` moved from `timeline/state.svelte.ts` to `timeline/state.ts` on `Notifier`. The new entry `src/lib/svelte` (`reactive`, `attach`, `Attachable`). The package exports map, the `svelte` peer range, and the lockfile root. `vite.config.ts` split into a `unit` and a `svelte-client` Vitest project. `tools/check.sh` probe peer link. `/docs/timeline`, a Playwright test, README, `docs/scope.md`, and the new `CHANGELOG.md`. Issue #95 and the epic #93 were read for the contract.

## Verification runs

- `CHAAYA_SKIP_BROWSER=1 ./tools/check.sh`: every step passed. Vitest ran 58 files and 525 tests, against 506 on main. The 19 new tests are 9 for the notifier, 3 for the scale and 7 for the binding.
- `npx vitest run --project svelte-client`: 7 passed under the browser build. Effects run there. Under the server build they did not, which is why the project exists.
- `npx playwright test tests/playwright/timeline.spec.ts --project=chromium`: 10 passed.
- Mutations, each restored after the run: drop `untrack` in `attach` (1 test fails), drop the listener `catch` (2 fail), drop the removed-mid-notify check (1 fails), notify twice in a zoom (2 fail), drop method binding in the proxy (4 fail), drop `track()` in the proxy (3 fail), drop the equal-write skip (1 fails). Dropping `reactive()` on `/docs/timeline` fails the new Playwright test with the density stuck at 50, which is the silent failure the epic warns about.
- The `svelte` floor is right. `createSubscriber` landed in Svelte 5.7.0 (sveltejs/svelte#14422).

## Review questions

1. Contract: `subscribe` returns the unsubscribe, `version` increments on every change, `notify` is protected. Notification is synchronous, and a throwing listener does not stop the others. Getters sit over private fields with the same public names and types. A zoom notifies once. `src/lib/core/observable.ts` imports nothing from `svelte`.
2. Arrays: `TimelineScale` exposes none. `scale` returns a fresh object on every read, as before.
3. Construction touches nothing, and `version` is 0 after it. The server safety step passed with the new entry.
4. Object shape: `$state` class fields already compiled to prototype accessors, so spreading or serialising a scale gave no own fields before and gives none now.
5. Svelte 4 idiom, visual values, consumer names, plan references: none. The gate steps passed.
6. Existing tests: the four `TimelineScale` tests are unchanged except the import specifier. The module path had to change because the file left the rune suffix.

## Findings

| Severity | Where | What | Status |
|---|---|---|---|
| L | `svelte/reactive.ts` | `reactive(reactive(x))` built a second proxy over the first. It worked, but identity differed from `reactive(x)`. | Fixed in the commit that carries this file. The proxy now maps to itself, and a test asserts `reactive(view) === view`. |
| INFO | `svelte/reactive.ts` | `in`, `Object.keys` and other non-`get` traps do not track. Public state lives in prototype getters whose set of keys never changes on `notify`, so nothing a view reads goes stale. | No change. |
| INFO | `svelte/reactive.ts` | A method that returns `this` returns the raw target, not the proxy. The read that fetched the method already subscribed the reader, so reactivity holds. Only identity differs. | No change. `TimelineScale` has no such method. |
| INFO | `core/observable.ts`, `report` | Where `reportError` is missing (Node), a listener error is rethrown from a microtask, which becomes an uncaught exception in that process. It is never swallowed. Server code rarely subscribes, because `createSubscriber` is a no-op on the server. | Listed as an owner decision in the PR. |
| OUT_OF_SCOPE | `core/sse/effect.svelte.ts` | `runInEffect` stays in core. The four follow loops still default to it, and moving it belongs with their conversion in #96 to #99. | Tracked by those issues. |

## Severity counts and verdict

Round one: C 0, H 0, M 0, L 1 (fixed), INFO 3. Verdict: REMEDIATE. The L fix gets a second read.

## Round two

Reviewed hash: `3a15c8e`, after the round-one fix.

- The round-one L is resolved. `reactive` stores the proxy as its own key, so `reactive(view)` returns `view`. The `WeakMap` holds the proxy as a value under its target too. A value that references its key does not keep the pair alive, so both are still collected.
- I read the full diff again: subscription identity and idempotent unsubscribe, the snapshot plus membership check during dispatch, `version` bumping before listeners run so a listener reads the new key, `#write` notifying once and skipping equal writes, the proxy `set` trap writing with the target as receiver, the frozen-property guard, `attach` untracking both the property read and the call, and `$effect` returning the teardown through `untrack`. No new defect.
- `tools/check.sh` only adds a peer link to the packed-types probe. No workflow file changed.
- `npm run check` (0 errors, 0 warnings), `npx eslint src/lib/svelte`, and `npx vitest run src/lib/svelte/` (7 passed) passed on this head. CI `gate` passed on the PR.

C 0, H 0, M 0, L 0. Residue from round one: none. Verdict: APPROVE, pending CodeRabbit.
