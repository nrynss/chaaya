# Review: #102 bindings docs and the 0.6 migration guide (no freeze)

Branch `issue-102-bindings-docs-no-freeze`. Reviewer: adversarial self-review, recorded per round.

The owner deferred the freeze. This PR does not run `tools/freeze-api.sh`, writes no `api/0.6.0/`, and makes no tag or release.

## Round 1

- **README and scope.** The README calls Chaaya framework-neutral, with Svelte 5 and React bindings. The Framework line in Protocol scope points to the bindings. Both bindings are listed under Exports (from #101). The `/docs/scope` page no longer says Svelte 5 only. A grep for "Svelte only", "Svelte 5 only" and "for now" across the README, `docs/`, `CHANGELOG.md` and `src/routes` finds nothing.
- **`docs/bindings.md`.** It covers the `Observable` contract: `subscribe`, `version`, one notification per change, state replaced rather than mutated, `attach` returning its teardown, and a throwing listener being logged. It covers both bindings, including the Svelte coarse-effect note and the React Strict Mode caveat, and a Vue 3 binding in about 20 lines.
- **`docs/migrating-0.6.md`.** It leads with the silent failure (a read without `reactive()` renders once). It then covers the `attach` signatures, `follow` becoming `attach`, the required `TranscriptClock.subscribe`, the read-only getters with the setters that stay, and the readonly lists.
  - Coverage was checked by diffing the `api/0.5.0` declarations against a fresh `dist`. Every changed member appears in the guide: each field that became a getter, every `attach(`, `follow(`, `followTopUp(`, `subscribe(`, and the kept setters.
- **`/docs/bindings` route.** It is linked from `/docs`. It shows one counter read through `reactive` and the same counter read bare in a child component, which stays at 0. A Playwright test pins both readings.
- Every docs route still constructs Chaaya classes through `reactive` (a grep over `src/routes` finds no bare construction).

Findings and resolutions:

1. **The bare reading first sat in the same template as the wrapped one,** where Svelte could fold both into one template effect, so the bare reading might update by accident. Fixed: the bare reading lives in its own component, whose template tracks only its prop.
2. **The CHANGELOG still said the migration guide "lands before the freeze".** Fixed: it links the guide and says the freeze has not run.

Verdict: APPROVE, pending CI.
- Gate: 67 files and 593 tests.
- Full browser leg on chromium, firefox and firefox-sink: 336 passed, 4 skipped. WebKit was not run, because its libraries are missing on this box.
