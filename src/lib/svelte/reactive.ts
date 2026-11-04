import { createSubscriber } from "svelte/reactivity"
import type { Observable } from "../core/observable.js"

/** One proxy per target, so wrapping twice hands back the same object. */
const proxies = new WeakMap<Observable, Observable>()

/**
 * Make an observable's reads reactive in Svelte 5.
 *
 * The result is a `Proxy` over the target. Every property read inside a
 * reactive context (a template, an effect, a `$derived`) subscribes that
 * context to the target, so the next `notify()` re-runs it. A read outside a
 * reactive context subscribes nothing. The target's subscription opens with
 * the first reactive reader and closes with the last.
 *
 * Reads and writes run against the target itself, so getters, setters, and
 * `#private` fields keep their brand checks. A method comes back bound to
 * the target, and the bound copy is cached, so `proxy.method` is stable.
 * Wrapping the same target again returns the same proxy.
 */
export function reactive<T extends Observable>(target: T): T {
	if (target === null || typeof target !== "object" || typeof target.subscribe !== "function") {
		throw new TypeError("reactive needs an observable with a subscribe method.")
	}
	const existing = proxies.get(target)
	if (existing !== undefined) return existing as T

	const track = createSubscriber((update) => target.subscribe(update))
	const bound = new Map<PropertyKey, { source: unknown; bound: unknown }>()

	const proxy = new Proxy(target, {
		get(object, key) {
			track()
			const value: unknown = Reflect.get(object, key, object)
			if (typeof value !== "function") return value
			// A proxy must return a frozen own property as it is, so a
			// non-writable, non-configurable method is not rebound.
			const own = Reflect.getOwnPropertyDescriptor(object, key)
			if (own !== undefined && own.configurable === false && own.writable === false) return value
			const cached = bound.get(key)
			if (cached !== undefined && cached.source === value) return cached.bound
			const method = (value as (...args: unknown[]) => unknown).bind(object)
			bound.set(key, { source: value, bound: method })
			return method
		},
		set(object, key, value) {
			return Reflect.set(object, key, value, object)
		}
	})
	proxies.set(target, proxy)
	return proxy
}
