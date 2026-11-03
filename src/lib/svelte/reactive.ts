import { createSubscriber } from "svelte/reactivity"
import type { Observable } from "../core/observable.js"

/** Make an observable's reads reactive in Svelte 5. */
export function reactive<T extends Observable>(target: T): T {
	const subscribe = createSubscriber((update) => target.subscribe(update))
	const methods = new Map<PropertyKey, { source: unknown; bound: unknown }>()
	return new Proxy(target, {
		get(raw, key) {
			subscribe()
			const value = Reflect.get(raw, key, raw)
			if (typeof value !== "function") return value
			const cached = methods.get(key)
			if (cached?.source === value) return cached.bound
			const bound = value.bind(raw)
			methods.set(key, { source: value, bound })
			return bound
		},
		set(raw, key, value) {
			return Reflect.set(raw, key, value, raw)
		},
	})
}
