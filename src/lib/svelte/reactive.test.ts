import { describe, expect, test } from "vitest"
import { Notifier } from "../core/observable.js"
import { reactive } from "./reactive.js"

class Counter extends Notifier {
	#value = 0

	get value(): number {
		return this.#value
	}

	set value(value: number) {
		this.#value = value
		this.notify()
	}

	increment(): void {
		this.value += 1
	}

	read = () => this.#value
}

describe("reactive", () => {
	test("private getters, setters and detached methods keep the raw receiver", () => {
		const target = new Counter()
		const counter = reactive(target)
		counter.value = 3
		const increment = counter.increment
		increment()
		expect(counter.value).toBe(4)
		expect(target.value).toBe(4)
		expect(counter.version).toBe(2)
		expect(counter).toBeInstanceOf(Counter)
	})

	test("bound methods keep their identity until their source changes", () => {
		const target = new Counter()
		const counter = reactive(target)
		expect(counter.increment).toBe(counter.increment)
		const original = counter.read
		expect(original).toBe(counter.read)
		target.read = () => 9
		expect(counter.read).not.toBe(original)
		expect(counter.read).toBe(counter.read)
		expect(counter.read()).toBe(9)
	})

	test("subscriptions through the proxy observe changes and can unsubscribe", () => {
		const counter = reactive(new Counter())
		const readings: number[] = []
		const subscribe = counter.subscribe
		const unsubscribe = subscribe(() => { readings.push(counter.value) })
		counter.increment()
		unsubscribe()
		counter.increment()
		expect(readings).toEqual([1])
	})
})
