# Review: credit wallet

Reviewed hash: `a91e9e910ade12bf68b14ada51335ad58f2a4c7f`.
This file records one agent's adversarial read of the change. It is not a maintainer approval.

## Scope read

`src/lib/priced` gains `CreditWallet` (`wallet.svelte.ts`) and `consumeTopUpReturn` (`top-up.ts`). `PricedAction` gains the `insufficient` phase, `parseInsufficientFunds`, `onRunSettled`, and `initialQuote`. Docs page, docs index link, priced action page, `docs/scope.md`, scope route, a browser harness, a Playwright spec, and three Vitest files. Issue #86: balance, insufficient funds, top-up return, refunds, no header or route named, adapter supplies backend calls.

## Verification runs

- `npm run check`: 0 errors, 0 warnings. `npm run lint`: clean.
- `npm run test`: 55 files, 494 tests passed. `npx vitest run src/lib/priced`: 37 passed.
- `svelte-package`, published svelte modules, server safety, publint: passed. `tools/published-api.sh`: 0.5.0 unreleased.
- `npx playwright test tests/playwright/credit-wallet.spec.ts tests/playwright/priced-action.spec.ts --project=chromium`: 6 passed.
- Mutations, each restored after the run: drop the insufficient branch (4 tests fail), drop the read-order guard in `#land` (1 fails), drop the settle hook call (4 fail), drop `initialQuote` (2 fail), let `reset` keep `insufficient` (1 fails), drop `history.state` preservation (1 fails), drop the path guard (1 fails).

## Review questions

1. Svelte 4 idiom: none. Runes only. Private `$state` fields carry the follower and reference, so `topUp` stays reactive.
2. Import-time browser globals: none. Location and history are read inside `consumeTopUpReturn` only. The server safety step passed.
3. Visual values: none in `src/lib`. The docs page draws only reference tokens and passes both gates.
4. Consumer or vendor names: none. The wallet names no header, route, param, or provider.
5. Plan references: none.
6. Scope: `docs/scope.md` and the scope route name the wallet. The README waits for #89, which rewrites the same lists.
7. Issue terms: the balance is `PriceAmount` and formats nothing. The refusal is its own phase, read through the adapter parser, and keeps the quote. The top-up return rides `JobPoller` and reads once with history replaced. A refund is a balance change on the next read.

## Findings

| Severity | Where | What | Status |
|---|---|---|---|
| L | `wallet.svelte.ts`, `TopUpPhase` doc | The doc said a newer follow leaves the older one `closed`. `topUp` reads only the current follow, so that state is never visible. | Fixed in the commit that carries this file. |
| M | `README.md` | The exports and docs lists do not name the wallet yet. | Deferred until #89 merges. Then main merges into this branch with a plain merge, no rebase, and the README lines land. |
| OUT_OF_SCOPE (L) | `src/lib/core/job/poll.svelte.ts`, `attach` | `attach` starts the first read before it calls the cleanup runner. If the runner throws (the default `runInEffect` outside component init), the poll keeps running with no cleanup. The wallet keeps the follower, so `wallet.close()` still stops it. | Existing poller behaviour. Not changed here. |

## Severity counts and verdict

Round one: C 0, H 0, M 1 (deferred, tracked), L 1 (fixed). Verdict: REMEDIATE. Round two runs after the README lands.

## Round two

Reviewed after main (with #89) merged into the branch with a plain merge and the README lines landed.

- The round-one M is resolved. The README scope summary, the `@nrynss/chaaya/priced` export entry, and the docs list now name the wallet, `insufficient`, `consumeTopUpReturn`, and `followTopUp`. The wording matches `docs/scope.md`.
- The round-one L fix reads correctly against the `topUp` getter.
- The diff was read again in full: wallet read ordering, the abort on a newer refresh, `close` restoring the settled phase, the follow answer marking the wallet ready, `action` composing the caller's settle hook before the refresh, the insufficient branch after the price change, `initialQuote` and expiry, and the return URL keeping other params, the hash, and `history.state`. No new defect.
- `npm run check`, `npm run lint`, and `npx vitest run src/lib/priced` passed again on the merged tree.

C 0, H 0, M 0, L 0. Residue from round one: none. Verdict: APPROVE, pending CodeRabbit.
