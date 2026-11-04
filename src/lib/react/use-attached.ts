import { useEffect } from "react"

/** Anything with an `attach()` that returns its teardown. */
export interface Attachable {
	attach(): () => void
}

/**
 * Call `target.attach()` after mount, and run the teardown it returns on
 * unmount, or before attaching a new `target`.
 *
 * Attach opens a watch, a listener or a stream, so it runs in an effect and
 * never during a server render.
 *
 * React's development Strict Mode mounts each component twice, so a target
 * there attaches, tears down and attaches again. A target whose teardown
 * only unsubscribes, such as `TranscriptFollower`, takes that. A target
 * whose teardown ends it for good does not: `FrameLoop`, `JobStream`,
 * `createEventStream`, `JobPoller` and `SessionGuard` stay closed after the
 * first teardown, and a guard has already sent its close. Under Strict Mode,
 * build such a target inside the effect that attaches it, so each mount
 * gets a fresh one.
 */
export function useAttached(target: Attachable): void {
	useEffect(() => target.attach(), [target])
}
