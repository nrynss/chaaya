/** One synchronous observation of a public state change. */
export type Listener = () => void

/** Framework-neutral state observed by a binding or another observable. */
export interface Observable {
	/** Subscribe to future changes. The returned function unsubscribes. */
	subscribe(listener: Listener): () => void
	/** Increments once per logical change, before listeners run. */
	readonly version: number
}

/** A class calls notify once after completing one logical public state change. */
export class Notifier implements Observable {
	#version = 0
	#listeners = new Set<Listener>()

	get version(): number {
		return this.#version
	}

	/** Stable and safe to pass unbound to an external-store binding. */
	readonly subscribe = (listener: Listener): (() => void) => {
		// Each subscription owns its teardown, even when callbacks are equal.
		const subscription = () => listener()
		this.#listeners.add(subscription)
		return () => { this.#listeners.delete(subscription) }
	}

	protected notify(): void {
		this.#version += 1
		// A listener added during this change starts with the next change.
		for (const listener of [...this.#listeners]) {
			if (!this.#listeners.has(listener)) continue
			try {
				listener()
			} catch {
				// One observer must not prevent delivery to the others.
			}
		}
	}
}
