import { Notifier } from "$lib/core/observable.js"

export interface LifecycleCounts {
	attaches: number
	teardowns: number
}

/** Private state exercises the proxy receiver on getters, setters and methods. */
export class Counter extends Notifier {
	#value = 0
	readonly #counts: LifecycleCounts

	constructor(counts: LifecycleCounts) {
		super()
		this.#counts = counts
	}

	get value(): number {
		return this.#value
	}

	set value(value: number) {
		if (Object.is(value, this.#value)) return
		this.#value = value
		this.notify()
	}

	get doubled(): number {
		return this.#value * 2
	}

	increment(): void {
		this.value += 1
	}

	attach(): () => void {
		this.#counts.attaches += 1
		let active = true
		return () => {
			if (!active) return
			active = false
			this.#counts.teardowns += 1
		}
	}
}
