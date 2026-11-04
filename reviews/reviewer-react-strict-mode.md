# Review: React Strict Mode re-attach through the binding

## Round 1
- A per-component ref missed a key remount of the same target: a target with an idempotent attach was torn down while still mounted. Fixed with a module WeakMap keyed by target; a test covers it.
- A FrameLoop test expected a synchronous close on unmount. Added a microtask flush.

## Round 2
- No file outside src/lib/react, its tests, and docs changes. Core API and behaviour are unchanged.
- A teardown that throws now throws from a microtask, so the error reaches the host's error reporting rather than React's commit. Accepted, and noted.
- A really torn-down closing target (reuse after unmount, `<Activity>` hide then show) stays closed, as before. Documented.
- Mutations: no adoption, ignoring the cancel flag, and not setting the flag each fail 9 tests. main's hook fails 9 of the new tests.

## Round 3
Clean.

## Round 4: CodeRabbit
- Two components sharing a target overwrote each other's pending teardown, so a stale microtask could tear down a target still mounted. Valid. Replaced the pending map with a reference-counted attachment per target: the first user attaches, the last unmount tears down a microtask later, and a re-attach in between keeps it. Tests added for siblings under Strict Mode and for re-attach after a real teardown.
- Mutations: ignore re-attach (10 fail), no sharing (4), no decrement (9), no delete after teardown (1). All caught.
