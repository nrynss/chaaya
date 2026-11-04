# Review: #99 history, transcript, capture, guard and theme off runes

Branch `issue-99-history-transcript-off-runes`. Reviewer: adversarial self-review, recorded per round.

## Round 1

Scope checked against the issue's acceptance list.

- No rune and no `svelte` import under `history`, `transcript`, `capture`, `guard` or `theme`. No `.svelte.ts` file is left in them.
- `history.test.ts`, the transcript tests, `camera-session.test.ts` and `theme.test.ts` pass. The only edits to existing tests are at lifecycle call sites: import specifiers, and the fake clock in `transcript.test.ts`, which gains `subscribe` now that the contract requires it.
- `follower.test.ts` drives a fake clock through `subscribe`, with no framework. It proves the follower skips a cut, notifies each `activeWord` change once, and stops listening after the teardown.
- The `transcript`, `transcript-video`, `history`, `still-capture`, `session-guard` and `theme` routes, and their `src/routes/tests` harnesses, read through `reactive(...)`. The video routes keep the teardown from `follower.attach()`.

Findings and resolutions:

1. **An editor change no longer ran `update`.** The rune `follow()` effect read the editor's words and cuts, so a cut made under a resting playhead skipped at once. The first conversion only re-published on an editor change, so the playhead stayed inside the new cut until the next clock event. Fixed: the editor subscription runs the same handler as the clock, and a test pins the skip.
2. **A transaction notified once per command inside it.** Listeners saw half-applied states synchronously. Fixed: commands inside a frame notify nothing, and the outermost frame notifies once when it closes. A rollback notifies only when a command had run. Tests pin both.
3. **`revertAll` with no cuts notified,** because a fresh empty array is never `Object.is` to the old one. Fixed with an early return, and pinned.
4. **The theme notified on a system preference change under a forced mode,** where `resolved` does not move. Fixed: only the system mode notifies. Pinned.
5. **The theme route's consumer snippet read `theme.resolved` bare,** which would render once and never update. Fixed: it wraps the store with `reactive`. The session-guard snippet keeps the teardown `attach()` now returns.
6. Style: the conversion script put the `Notifier` import above the module comment in four files, and it left a double blank line in the camera session. Fixed.

Mutation pass (cp backups): 11 mutations across the follower, history, guard, theme, editor and camera. All 11 are caught.

Design choices left open by the issue, for the owner:
- The follower notifies only when `activeWord` changes, and only while attached. `activeWord` reads live at any time.
- `EditHistory` keeps setters for `serverRevision` and `serverDoc`, because callers that load a document from the server set them, and the tests do. `TranscriptEditor.reason` keeps its setter.
- The theme singleton's file is `theme/store.ts`, because `theme/theme.ts` already holds the pure helpers. The `ThemeStore` class is not exported; `theme` is the one instance.
- `SessionGuard.attach()` returns a teardown that runs `destroy()`, so it also sends the close. A second `attach()` returns the same teardown.

Verdict: APPROVE, pending CI.

Gate (`CHAAYA_SKIP_BROWSER=1 ./tools/check.sh`): every check passed. Browser leg (chromium, firefox, firefox-sink) on the six route specs: 160 passed. WebKit was not run, because its libraries are missing on this box.

## Round 2

Re-review of the round 1 fixes. The editor-change path recurses safely: a seek out of a cut re-enters through the clock subscription, which finds no cut and publishes once, so the outer call publishes nothing. The transaction rollback restores `entries` and `doc` before it notifies. Nested frames stay quiet until the outermost one closes. The gate, the unit suite and the browser leg pass again after the fixes. No new findings.

Verdict: APPROVE.
