import { describe, expect, test, vi } from "vitest"
import { Notifier } from "./observable.js"

class Pair extends Notifier {
	left = 0
	right = 0

	change(left: number, right: number): void {
		this.left = left
		this.right = right
		this.notify()
	}
}

describe("Notifier", () => {
	test("one completed change synchronously publishes its state and new version once", () => {
		const pair = new Pair()
		const readings: number[][] = []
		pair.subscribe(() => { readings.push([pair.left, pair.right, pair.version]) })
		expect(pair.version).toBe(0)
		expect(readings).toEqual([])
		pair.change(2, 3)
		expect(readings).toEqual([[2, 3, 1]])
		pair.change(4, 5)
		expect(readings).toEqual([[2, 3, 1], [4, 5, 2]])
	})

	test("subscribe works unbound and unsubscribe is idempotent", () => {
		const pair = new Pair()
		const subscribe = pair.subscribe
		const listener = vi.fn()
		const unsubscribe = subscribe(listener)
		pair.change(1, 2)
		expect(listener).toHaveBeenCalledTimes(1)
		unsubscribe()
		unsubscribe()
		pair.change(3, 4)
		expect(listener).toHaveBeenCalledTimes(1)
		expect(pair.version).toBe(2)
	})

	test("a throwing listener does not interrupt the change or later observers", () => {
		const pair = new Pair()
		pair.subscribe(() => { throw new Error("observer failed") })
		const listener = vi.fn()
		pair.subscribe(listener)
		expect(() => pair.change(1, 2)).not.toThrow()
		expect(listener).toHaveBeenCalledTimes(1)
		expect(pair.version).toBe(1)
	})

	test("equal callbacks have independent subscriptions", () => {
		const pair = new Pair()
		const listener = vi.fn()
		const unsubscribe = pair.subscribe(listener)
		pair.subscribe(listener)
		unsubscribe()
		pair.change(1, 2)
		expect(listener).toHaveBeenCalledTimes(1)
	})

	test("subscriptions added during delivery begin with the next change", () => {
		const pair = new Pair()
		const late = vi.fn()
		pair.subscribe(() => { pair.subscribe(late) })
		pair.change(1, 2)
		expect(late).not.toHaveBeenCalled()
		pair.change(3, 4)
		expect(late).toHaveBeenCalledTimes(1)
	})
})
