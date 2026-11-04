# Review: #101 React binding

Branch `issue-101-react-binding-hooks`. Reviewer: adversarial self-review, recorded per round.

## Round 1

Scope checked against the issue's acceptance list.

- **`@nrynss/chaaya/react` exports `useObservable` and `useAttached`.** It is typed, and the packed-types probe covers it: the probe links `react` and `@types/react` from the checkout, as it already linked `svelte`. Server safety imports the entry with no DOM.
- **`useObservable(target)`** is `useSyncExternalStore` with `target.version` as the snapshot, for both the client and the server snapshot. `subscribe` is wrapped in a `useCallback` keyed on the target, so an observable whose `subscribe` lives on its prototype keeps its receiver. A new target resubscribes.
- **`useAttached(target)`** is `useEffect(() => target.attach(), [target])`. React runs the returned teardown.
- **Tests** (`src/lib/react/react.test.ts`) run in the Svelte-free `neutral` project, with React Testing Library:
  - A `FrameLoop` against a scripted SSE response, through a reconnect that resends `Last-Event-ID: 2`.
  - A `JobStream` with progress up to a terminal state.
  - A `PricedAction` through quote, confirm and run.
  - Each test asserts one render per notification. The `PricedAction` test asserts exactly `1 + version` renders.
  - Further tests cover a prototype `subscribe`, the unsubscribe on unmount, a target swap, the Strict Mode attach, teardown and attach sequence, and the refusal of a non-observable.
- **Both directions are guarded by ESLint.** A React import outside `src/lib/react` fails, and so does a Svelte import inside it, as do imports of `react-dom` and `@testing-library/react`. Probe files proved all three.
- `react` is an optional peer, `^18.0.0 || ^19.0.0`. The dev dependencies are `react`, `react-dom`, `@testing-library/react`, `@types/react` and `@types/react-dom`.

Mutation pass (cp backups): 3 of 3 caught. The mutations dropped the store hook, froze the subscribe callback's target dependency, and dropped the returned teardown.

Findings and resolutions:

1. **Strict Mode and closing targets.** In development, Strict Mode runs attach, then the teardown, then attach again. `FrameLoop`, `JobStream`, `createEventStream`, `JobPoller` and `SessionGuard` end for good on their teardown, so the second attach does nothing. A guard has also already sent its close. This is not fixed here, because reopening a closed loop would change core behaviour. It is documented on `useAttached` and in the CHANGELOG, and raised for the owner.
2. A `Notifier` subclass in a test called the protected `notify()` from outside, which svelte-check rejected. Fixed with a subclass method.

Verdict: APPROVE, pending CI. The gate passes: 67 files and 593 tests.
