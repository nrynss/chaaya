# Changelog

Changes that reach the published package. A release section names its tag.
Work merged since the last tag sits under Unreleased.

## Unreleased (0.6.0)

0.6.0 makes the core framework-neutral, with Svelte as one binding. It is a
breaking release. The migration guide lands before the freeze.

### Added

- `Notifier`, `Observable`, and `Listener` on `@nrynss/chaaya/core`. A
  stateful class keeps its fields private behind getters and calls
  `notify()` once per logical change. `subscribe(listener)` returns the
  unsubscribe, and `version` increments once per change, before listeners
  run. `subscribe` is bound to its instance, so it can be passed unbound. Notification is
  synchronous. A listener that throws does not stop the others, and its
  error is logged with `console.error`. Nothing is rethrown.
- `@nrynss/chaaya/svelte`, the Svelte 5 binding. `reactive(x)` makes the
  reads of an observable reactive in a template, an effect, or a
  `$derived`. `attach(x)` runs `x.attach()` in the calling effect and calls
  the teardown it returns when the effect is destroyed.

### Changed

- `TimelineScale` on `@nrynss/chaaya/timeline` is an observable and imports
  no framework. `pixelsPerSecond` and `scrollSeconds` keep their names and
  types as getters and setters. A zoom notifies once. A write of the value
  already held does not notify. A Svelte view now wraps the scale:
  `reactive(new TimelineScale())`. Without the wrapper a read renders once
  and never updates.
- The `svelte` peer range is `^5.7.0`, because the binding uses
  `createSubscriber` from `svelte/reactivity`.
