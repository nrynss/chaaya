/** Anything with an `attach()` that returns its teardown. */
export interface Attachable {
    attach(): () => void;
}
/**
 * Call `target.attach()` after mount, and run the teardown it returns after
 * unmount, or after the component moves to a new `target`.
 *
 * Attach opens a watch, a listener or a stream, so it runs in an effect and
 * never during a server render.
 *
 * Components that use the same target share one attachment: the first
 * attaches it, and the teardown runs once the last one unmounts. That
 * teardown waits one microtask. If any component attaches the same target
 * again before then, the teardown is cancelled and the target stays
 * attached. React's development Strict Mode unmounts and remounts each
 * effect at once, and this is what keeps a target alive through it. A
 * `FrameLoop`, `JobStream`, `createEventStream`, `JobPoller` or
 * `SessionGuard` ends for good on its teardown. With the wait, Strict Mode
 * leaves it attached once: one connection, no lost state, and no close sent
 * by a guard during mount. A real unmount, or a move to a new target, tears
 * the old one down a microtask later.
 */
export declare function useAttached(target: Attachable): void;
