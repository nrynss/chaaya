import { useEffect } from "react"

/** Anything with an `attach()` that returns its teardown. */
export interface Attachable {
	attach(): () => void
}

/** One live attachment of a target, shared by every component using it. */
interface Attachment {
	readonly teardown: () => void
	/** How many mounted effects use it. */
	users: number
}

/** The live attachments, by target. Keyed by the target rather than by the
 * component, so components that share a target, or a component remounted
 * under a new key, share one attachment instead of attaching twice. */
const live = new WeakMap<Attachable, Attachment>()

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
export function useAttached(target: Attachable): void {
	useEffect(() => {
		let attachment = live.get(target)
		if (attachment === undefined) {
			const teardown = target.attach()
			if (typeof teardown !== "function") {
				throw new TypeError("attach() must return its teardown function.")
			}
			attachment = { teardown, users: 0 }
			live.set(target, attachment)
		}
		attachment.users++
		const mine = attachment
		return () => {
			mine.users--
			queueMicrotask(() => {
				// A re-attach within the microtask keeps the attachment.
				if (mine.users > 0 || live.get(target) !== mine) return
				live.delete(target)
				mine.teardown()
			})
		}
	}, [target])
}
