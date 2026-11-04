import { useEffect } from "react"

/** Anything with an `attach()` that returns its teardown. */
export interface Attachable {
	attach(): () => void
}

/** A teardown that waits one microtask, so a re-attach can cancel it. */
interface PendingTeardown {
	readonly teardown: () => void
	cancelled: boolean
}

/** The teardowns still waiting, by target. Keyed by the target rather than
 * by the component, so a component remounted under a new key adopts the
 * live attachment too, instead of attaching twice and losing it. */
const waiting = new WeakMap<Attachable, PendingTeardown>()

/**
 * Call `target.attach()` after mount, and run the teardown it returns after
 * unmount, or after the component moves to a new `target`.
 *
 * Attach opens a watch, a listener or a stream, so it runs in an effect and
 * never during a server render.
 *
 * The teardown waits one microtask. If any component attaches the same
 * target again before then, the teardown is cancelled and the target stays
 * attached. React's development Strict Mode unmounts and remounts each
 * effect at once, and this is what keeps a target alive through it. A
 * `FrameLoop`, `JobStream`, `createEventStream`, `JobPoller` or
 * `SessionGuard` ends for good on its teardown. With the wait, Strict Mode
 * leaves it attached once: one connection, no lost state, and no close sent
 * by a guard during mount. A real unmount, or a move to a new target, tears
 * the old one down a microtask later.
 */
export function useAttached(target: Attachable): void {
	useEffect(() => {
		const pending = waiting.get(target)
		let teardown: () => void
		if (pending !== undefined && !pending.cancelled) {
			// A remount of the same target within the microtask: keep the
			// live attachment.
			pending.cancelled = true
			waiting.delete(target)
			teardown = pending.teardown
		} else {
			teardown = target.attach()
			if (typeof teardown !== "function") {
				throw new TypeError("attach() must return its teardown function.")
			}
		}
		return () => {
			const entry: PendingTeardown = { teardown, cancelled: false }
			waiting.set(target, entry)
			queueMicrotask(() => {
				if (entry.cancelled) return
				entry.cancelled = true
				if (waiting.get(target) === entry) waiting.delete(target)
				entry.teardown()
			})
		}
	}, [target])
}
