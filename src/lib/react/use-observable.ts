import { useCallback, useSyncExternalStore } from "react"
import type { Listener, Observable } from "../core/observable.js"

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
export function useObservable<T extends Observable>(target: T): T {
	if (target === null || typeof target !== "object" || typeof target.subscribe !== "function") {
		throw new TypeError("useObservable needs an observable with a subscribe method.")
	}
	// A plain observable may define subscribe on its prototype, so call it on
	// the target rather than passing the method on its own.
	const subscribe = useCallback((listener: Listener) => target.subscribe(listener), [target])
	const version = (): number => target.version
	useSyncExternalStore(subscribe, version, version)
	return target
}
