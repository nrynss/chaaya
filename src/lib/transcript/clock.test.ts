import { describe, expect, it, vi } from "vitest"
import { mediaClock } from "./follow.js"

/** An element with a clock and hand-fired events. */
function fakeElement(): HTMLMediaElement & { fire(type: string): void } {
	const target = new EventTarget()
	return Object.assign(target, {
		currentTime: 0,
		fire(type: string): void {
			target.dispatchEvent(new Event(type))
		}
	}) as unknown as HTMLMediaElement & { fire(type: string): void }
}

describe("mediaClock", () => {
	it("hears timeupdate, seeking and seeked, and nothing else", () => {
		const element = fakeElement()
		const clock = mediaClock(element)
		const heard = vi.fn()
		clock.subscribe(heard)
		element.fire("timeupdate")
		element.fire("seeking")
		element.fire("seeked")
		expect(heard).toHaveBeenCalledTimes(3)
		element.fire("play")
		element.fire("progress")
		expect(heard).toHaveBeenCalledTimes(3)
	})

	it("stops hearing after its teardown, which is safe to call twice", () => {
		const element = fakeElement()
		const clock = mediaClock(element)
		const heard = vi.fn()
		const stop = clock.subscribe(heard)
		stop()
		stop()
		element.fire("timeupdate")
		expect(heard).not.toHaveBeenCalled()
	})

	it("keeps one listener subscribed twice as two subscriptions", () => {
		const element = fakeElement()
		const clock = mediaClock(element)
		const heard = vi.fn()
		const first = clock.subscribe(heard)
		clock.subscribe(heard)
		element.fire("timeupdate")
		expect(heard).toHaveBeenCalledTimes(2)
		first()
		element.fire("timeupdate")
		expect(heard).toHaveBeenCalledTimes(3)
	})

	it("reads and seeks the element, and starts no timer", () => {
		vi.useFakeTimers()
		try {
			const element = fakeElement()
			const clock = mediaClock(element)
			clock.subscribe(() => undefined)
			clock.seek(2.5)
			expect(clock.currentTime).toBe(2.5)
			expect(vi.getTimerCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})
})
