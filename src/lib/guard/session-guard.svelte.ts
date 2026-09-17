/** What the guard needs to close one live session. */
export interface SessionGuardOptions {
	/** The endpoint that receives the close notice. */
	readonly url: string
}

/**
 * Closes one live session when its page goes away.
 *
 * A page that holds a session builds one guard, calls attach() after it
 * mounts, and calls destroy() when it is destroyed. The guard sends its
 * close on pagehide and on destroy. A latch keeps the first send while
 * later ones do nothing, so the pair still reaches the server exactly once.
 *
 * Building a guard touches no browser global. Only attach(), close() and
 * destroy() reach the window, so a server render may build one freely.
 */
export class SessionGuard {
	/** True once the close notice has gone. */
	closed = $state(false)

	readonly #url: string
	#onHide: (() => void) | null = null

	constructor(options: SessionGuardOptions) {
		this.#url = options.url
	}

	/**
	 * Listen for the page going away. Call after mount, so no server render
	 * touches the window. A second call does nothing.
	 */
	attach(): void {
		if (this.#onHide !== null) return
		const onHide = () => this.close()
		this.#onHide = onHide
		window.addEventListener("pagehide", onHide)
	}

	/**
	 * Tell the server the session is leaving. The first call sends, and every
	 * later call does nothing. The notice goes by beacon when the browser
	 * offers one, and by a keepalive request otherwise, so it survives unload.
	 */
	close(): void {
		if (this.closed) return
		this.closed = true
		if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
			try {
				if (navigator.sendBeacon(this.#url)) return
			} catch {
				// Fall through to the keepalive request below.
			}
		}
		void fetch(this.#url, { method: "POST", keepalive: true }).catch(() => {
			// The page is leaving, so a failed close has nowhere to report.
		})
	}

	/**
	 * Stop listening, and send the close when it has not gone. Call on
	 * destroy, so a navigation that never fired pagehide still closes.
	 */
	destroy(): void {
		if (this.#onHide !== null) {
			window.removeEventListener("pagehide", this.#onHide)
			this.#onHide = null
		}
		this.close()
	}
}
