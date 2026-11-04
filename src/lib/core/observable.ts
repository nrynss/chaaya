/**
 * The framework-neutral change signal. A class that holds public state
 * extends `Notifier`, keeps each field private behind a getter, and calls
 * `notify()` once per logical change. A binding turns that signal into its
 * framework's reactivity. `@nrynss/chaaya/svelte` is the Svelte one. This
 * module imports no framework.
 */

/** Called after a public state change. It reads the new state itself. */
export type Listener = () => void

/** State that reports its own changes. */
export interface Observable {
	/** Call listener after any public state change. Returns the unsubscribe. */
	subscribe(listener: Listener): () => void
	/** Increments on every change. A cheap snapshot key for bindings. */
	readonly version: number
}

/** One subscription. A listener subscribed twice holds two entries, so each
 * unsubscribe removes only its own. */
interface Subscription {
	readonly listener: Listener
}

/** Hand an error a listener threw to the host, after the other listeners
 * have run. A browser reports it through `reportError`, the way an event
 * listener's error is reported. A runtime without `reportError` throws it
 * from a microtask, so it is never swallowed. */
function report(error: unknown): void {
	const host = globalThis as { reportError?: (error: unknown) => void }
	if (typeof host.reportError === "function") {
		host.reportError(error)
		return
	}
	queueMicrotask(() => {
		throw error
	})
}

/**
 * The base class for observable state. Construction touches nothing outside
 * the instance, so it is safe at import time and on the server.
 *
 * Notification is synchronous. Listeners run in subscription order. One that
 * throws does not stop the others, and its error is reported afterwards. A
 * listener added during a notification first runs on the next one. A
 * listener removed during a notification does not run again, even in the
 * notification that removed it.
 */
export class Notifier implements Observable {
	#subscriptions = new Set<Subscription>()
	#version = 0

	/** Increments on every change. A cheap snapshot key for bindings. */
	get version(): number {
		return this.#version
	}

	/** Call listener after any public state change. Returns the unsubscribe,
	 * which is safe to call more than once. */
	subscribe(listener: Listener): () => void {
		if (typeof listener !== "function") {
			throw new TypeError("subscribe needs a listener function.")
		}
		const subscription: Subscription = { listener }
		this.#subscriptions.add(subscription)
		return () => {
			this.#subscriptions.delete(subscription)
		}
	}

	/** Mark one logical change. Bumps `version`, then calls every listener. */
	protected notify(): void {
		this.#version += 1
		for (const subscription of [...this.#subscriptions]) {
			if (!this.#subscriptions.has(subscription)) continue
			try {
				subscription.listener()
			} catch (error) {
				report(error)
			}
		}
	}
}
