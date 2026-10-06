/** Whether the page can hold a stream right now. A hidden page cannot run
 * one, because a mobile browser suspends its fetch. An offline page cannot
 * reach one either. Both readings happen on each call, so a test that flips
 * visibility or network sees the flip at once. Importing this module touches
 * nothing, so a server import stays safe. */
export function isPaused(): boolean {
	if (typeof document !== "undefined" && document.visibilityState === "hidden") return true
	if (typeof navigator !== "undefined") {
		try {
			if (navigator.onLine === false) return true
		} catch {
			return false
		}
	}
	return false
}

/** Run `onPause` while the page cannot hold a stream and `onResume` once it
 * can again. Both callbacks must tolerate repeats, because a visibility flip
 * and a network flip can report the same state twice. The returned function
 * removes the listeners. With no document or window it returns at once, so a
 * server caller needs no guard of its own. */
export function watchPause(onPause: () => void, onResume: () => void): () => void {
	if (typeof document === "undefined" || typeof window === "undefined") return () => {}
	const reevaluate = (): void => {
		if (isPaused()) onPause()
		else onResume()
	}
	const onVisibility = (): void => {
		reevaluate()
	}
	const onOnline = (): void => {
		reevaluate()
	}
	const onOffline = (): void => {
		reevaluate()
	}
	document.addEventListener("visibilitychange", onVisibility)
	window.addEventListener("online", onOnline)
	window.addEventListener("offline", onOffline)
	return () => {
		document.removeEventListener("visibilitychange", onVisibility)
		window.removeEventListener("online", onOnline)
		window.removeEventListener("offline", onOffline)
	}
}
