import type { Observable } from "../core/observable.js";
/**
 * Re-render when `target` notifies, and return `target`.
 *
 * The snapshot is `target.version`, which bumps once per logical change
 * before listeners run, so React reads a stable number and never tears. No
 * class has to build snapshot objects. Read the target's fields during
 * render as usual: one notification means one re-render, however many
 * fields it moved.
 *
 * The subscription opens on mount and closes on unmount, or when `target`
 * changes identity. Keep one instance per component, in `useState` or
 * `useMemo`, so a render does not build a fresh one.
 */
export declare function useObservable<T extends Observable>(target: T): T;
