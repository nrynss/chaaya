import { flushSync } from "svelte"
import { expect, test } from "vitest"
import { Notifier } from "../core/observable"
import { TimelineScale } from "../timeline/state"
import { attach } from "./attach.svelte"
import { reactive } from "./reactive"

test("a reactive read updates when the target notifies", () => {
	const scale = reactive(new TimelineScale(50, 0))
	const seen: number[] = []
	const stop = $effect.root(() => {
		$effect(() => {
			seen.push(scale.pixelsPerSecond)
		})
	})
	flushSync()
	expect(seen).toEqual([50])
	scale.zoom(2, 0)
	flushSync()
	expect(seen).toEqual([50, 100])
	scale.pixelsPerSecond = 25
	flushSync()
	expect(seen).toEqual([50, 100, 25])
	stop()
	scale.pixelsPerSecond = 10
	flushSync()
	expect(seen).toEqual([50, 100, 25])
})

test("a derived over a method re-runs, and a plain instance never does", () => {
	const inner = new TimelineScale(50, 0)
	const scale = reactive(inner)
	const raw = new TimelineScale(50, 0)
	let wrapped = ""
	let plain = ""
	const stop = $effect.root(() => {
		const ticks = $derived(scale.ticks(0, 4, 100).join(","))
		$effect(() => {
			wrapped = ticks
		})
		$effect(() => {
			plain = String(raw.pixelsPerSecond)
		})
	})
	flushSync()
	expect(wrapped).toBe("0,2,4")
	expect(plain).toBe("50")
	inner.zoom(2, 0)
	raw.zoom(2, 0)
	flushSync()
	expect(wrapped).toBe("0,1,2,3,4")
	// The silent failure the binding exists for: no reactive, no update.
	expect(plain).toBe("50")
	stop()
})

test("the target subscription opens with the first reader and closes with the last", async () => {
	const scale = new TimelineScale()
	let open = 0
	const subscribe = scale.subscribe.bind(scale)
	scale.subscribe = (listener) => {
		open += 1
		const unsubscribe = subscribe(listener)
		return () => {
			open -= 1
			unsubscribe()
		}
	}
	const view = reactive(scale)
	void view.pixelsPerSecond
	expect(open).toBe(0)
	const first = $effect.root(() => {
		$effect(() => {
			void view.pixelsPerSecond
		})
	})
	const second = $effect.root(() => {
		$effect(() => {
			void view.scrollSeconds
		})
	})
	flushSync()
	expect(open).toBe(1)
	first()
	flushSync()
	expect(open).toBe(1)
	second()
	flushSync()
	await Promise.resolve()
	expect(open).toBe(0)
})

test("the proxy keeps private fields, binds methods stably, and wraps once", () => {
	const target = new TimelineScale(100, 2)
	const view = reactive(target)
	expect(reactive(target)).toBe(view)
	expect(reactive(view)).toBe(view)
	expect(view).toBeInstanceOf(TimelineScale)
	const zoom = view.zoom
	expect(view.zoom).toBe(zoom)
	zoom(2, 5)
	expect(target.pixelsPerSecond).toBe(200)
	view.scrollSeconds = 1
	expect(target.scrollSeconds).toBe(1)
	expect(view.version).toBe(target.version)
})

test("reactive refuses a value that is not observable", () => {
	expect(() => reactive({} as unknown as Notifier)).toThrow(TypeError)
	expect(() => reactive(null as unknown as Notifier)).toThrow(TypeError)
})

/** A follow loop stand-in that counts its starts and stops and notifies. */
class Follower extends Notifier {
	starts = 0
	stops = 0
	#ticks = 0
	get ticks(): number {
		return this.#ticks
	}
	tick(): void {
		this.#ticks += 1
		this.notify()
	}
	attach(): () => void {
		this.starts += 1
		void this.ticks
		return () => {
			this.stops += 1
		}
	}
}

test("attach starts once, survives notifies, and tears down with its effect", () => {
	const follower = new Follower()
	const view = reactive(follower)
	const stop = $effect.root(() => {
		attach(view)
	})
	flushSync()
	expect(follower.starts).toBe(1)
	view.tick()
	view.tick()
	flushSync()
	expect(follower.starts).toBe(1)
	expect(follower.stops).toBe(0)
	stop()
	expect(follower.stops).toBe(1)
})

test("attach refuses a target whose attach returns no teardown", () => {
	const bad = { attach: () => undefined as unknown as () => void }
	expect(() => {
		const stop = $effect.root(() => {
			attach(bad)
		})
		flushSync()
		stop()
	}).toThrow(TypeError)
})
