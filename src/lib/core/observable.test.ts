import { afterEach, expect, test, vi } from "vitest"
import { Notifier } from "./observable"

/** A notifier with a public trigger, so a test can mark one change. */
class Counter extends Notifier {
	#count = 0
	get count(): number {
		return this.#count
	}
	bump(): void {
		this.#count += 1
		this.notify()
	}
	/** Three field writes, one logical change. */
	bumpThrice(): void {
		this.#count += 3
		this.notify()
	}
}

afterEach(() => {
	vi.unstubAllGlobals()
})

test("a subscriber hears each change and stops after unsubscribe", () => {
	const counter = new Counter()
	const seen: number[] = []
	const unsubscribe = counter.subscribe(() => seen.push(counter.count))
	counter.bump()
	counter.bump()
	unsubscribe()
	counter.bump()
	expect(seen).toEqual([1, 2])
	expect(() => unsubscribe()).not.toThrow()
})

test("one logical change notifies once and bumps version once", () => {
	const counter = new Counter()
	const listener = vi.fn()
	counter.subscribe(listener)
	expect(counter.version).toBe(0)
	counter.bumpThrice()
	expect(listener).toHaveBeenCalledTimes(1)
	expect(counter.version).toBe(1)
	counter.bump()
	expect(counter.version).toBe(2)
})

test("version increments with no subscriber", () => {
	const counter = new Counter()
	counter.bump()
	counter.bump()
	expect(counter.version).toBe(2)
})

test("a listener subscribed twice holds two subscriptions", () => {
	const counter = new Counter()
	const listener = vi.fn()
	const first = counter.subscribe(listener)
	counter.subscribe(listener)
	counter.bump()
	expect(listener).toHaveBeenCalledTimes(2)
	first()
	counter.bump()
	expect(listener).toHaveBeenCalledTimes(3)
})

test("a throwing listener does not stop the others, and its error is logged", () => {
	const logged: unknown[][] = []
	const log = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
		logged.push(args)
	})
	const queued = vi.fn()
	vi.stubGlobal("queueMicrotask", queued)
	const counter = new Counter()
	const failure = new Error("listener broke")
	const before = vi.fn()
	const after = vi.fn()
	counter.subscribe(before)
	counter.subscribe(() => {
		throw failure
	})
	counter.subscribe(after)
	expect(() => counter.bump()).not.toThrow()
	expect(before).toHaveBeenCalledTimes(1)
	expect(after).toHaveBeenCalledTimes(1)
	expect(counter.version).toBe(1)
	expect(logged).toHaveLength(1)
	expect(logged[0]).toContain(failure)
	// Nothing is rethrown later, so the host never sees an uncaught error.
	expect(queued).not.toHaveBeenCalled()
	log.mockRestore()
})

test("each throwing listener is logged once per notification", () => {
	const log = vi.spyOn(console, "error").mockImplementation(() => {})
	const counter = new Counter()
	const first = new Error("first")
	const second = new Error("second")
	counter.subscribe(() => {
		throw first
	})
	counter.subscribe(() => {
		throw second
	})
	counter.bump()
	expect(log.mock.calls.map(([, error]) => error)).toEqual([first, second])
	counter.bump()
	expect(log.mock.calls.map(([, error]) => error)).toEqual([first, second, first, second])
	log.mockRestore()
})

test("notification is synchronous", () => {
	const counter = new Counter()
	let heard = false
	counter.subscribe(() => {
		heard = true
	})
	counter.bump()
	expect(heard).toBe(true)
})

test("a listener removed mid-notification does not run, and one added waits", () => {
	const counter = new Counter()
	const late = vi.fn()
	const removed = vi.fn()
	let removeSecond = (): void => {}
	counter.subscribe(() => {
		removeSecond()
		counter.subscribe(late)
	})
	removeSecond = counter.subscribe(removed)
	counter.bump()
	expect(removed).not.toHaveBeenCalled()
	expect(late).not.toHaveBeenCalled()
	counter.bump()
	expect(late).toHaveBeenCalledTimes(1)
})

test("subscribe refuses a listener that is not a function", () => {
	const counter = new Counter()
	expect(() => counter.subscribe(undefined as unknown as () => void)).toThrow(TypeError)
})

test("subscribe works unbound", () => {
	const counter = new Counter()
	const subscribe = counter.subscribe
	const listener = vi.fn()
	const unsubscribe = subscribe(listener)
	counter.bump()
	unsubscribe()
	counter.bump()
	expect(listener).toHaveBeenCalledTimes(1)
	expect(counter.subscribe).toBe(subscribe)
})

test("a listener reads the new state and the new version", () => {
	const counter = new Counter()
	const readings: Array<[number, number]> = []
	counter.subscribe(() => readings.push([counter.count, counter.version]))
	counter.bump()
	counter.bumpThrice()
	expect(readings).toEqual([
		[1, 1],
		[4, 2]
	])
})
