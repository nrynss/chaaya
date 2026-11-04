# Review: #100 framework neutrality in the gate and the package

Branch `issue-100-framework-neutral-gate`. Reviewer: adversarial self-review, recorded per round.

## Round 1

Scope checked against the issue's acceptance list.

- **Lint.** `eslint.config.js` replaces the core-only component rule with a neutral rule over `src/lib`, except `src/lib/svelte` and `src/lib/sveltekit`. It fails an import, a re-export, or a dynamic import of `svelte`, a `svelte/` subpath, any `@sveltejs/` package, or a `.svelte` file. A `.svelte.ts` or `.svelte.js` module outside the binding directories fails too. The core stylesheet rules stay. Because one rule setting replaces another for the same file, the core block repeats the neutral patterns. A probe file proved that each shape fails, in core and in another module.
- **Guard.** `tools/guards/framework-neutral.mjs`, wired into `tools/check.sh`, fails on `$state`, `$derived`, `$effect`, `$props`, `$bindable`, `$inspect` or `$host` in code lines outside the binding directories. It also fails on a `.svelte`, `.svelte.ts` or `.svelte.js` file there. It reads comment-stripped lines, so prose about a rune passes. A property named like a rune (`obj.$state`) and a longer identifier (`my$state`) pass. An object key named `$effect` fails, which is acceptable in a neutral module.
- **Svelte-free Vitest project.** The `neutral` project has no `extends`, so it inherits no Svelte or SvelteKit plugin. It runs every library test outside the binding directories: 63 files and 555 tests. The `unit` project keeps the rest, so no test runs twice. A `$state` field in `history.ts` fails 19 tests there with `ReferenceError: $state is not defined`.
- **Packaging.** Only `./svelte` and `./sveltekit` keep the `svelte` export condition. `svelte` and `bits-ui` are optional peers. The lockfile is synced with `npm install --package-lock-only`, which drops the uninstalled `bits-ui` peer tree. `published-svelte-modules.mjs` fails a `.svelte.js` file in `dist` outside the binding directories.
- **Server safety.** The guard walks the exports map, so `./svelte` was already imported with no DOM. A comment in `check.sh` now says so.
- **`svelte4-leakage.mjs`** still runs, and it is scoped to the binding directories.

Acceptance, run through the full gate:
- A `svelte` import added to `history.ts` fails `./tools/check.sh` at ESLint, naming `src/lib/history/history.ts:470`.
- A `$state` field added to `history.ts` fails `./tools/check.sh`, naming `src/lib/history/history.ts:95: the $state rune`.
- `npm pack`, the published-types probe, publint and server safety pass with the new exports map.

Findings and resolutions:

1. **The lockfile still listed `bits-ui` as an installed peer** after it became optional. Fixed: the lockfile is synced, so `npm ci` and the manifest agree.
2. **The core block would have silently dropped the neutral rules for core files**, because a later `no-restricted-syntax` setting replaces an earlier one. Fixed: the core block spreads the neutral selectors. A probe proved that core fails both a stylesheet import and a Svelte import.

Verdict: APPROVE, pending CI. The gate passes: 66 files and 585 tests.
