// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest"

let dark = false
const changeListeners: (() => void)[] = []

beforeEach(() => {
	vi.resetModules()
	localStorage.clear()
	dark = false
	changeListeners.length = 0
	vi.stubGlobal("matchMedia", (query: string) => ({
		get matches() {
			return query.includes("dark") && dark
		},
		addEventListener: (_type: string, listener: () => void) => changeListeners.push(listener)
	}))
})

test("importing the store reads nothing until first use", async () => {
	const read = vi.spyOn(Storage.prototype, "getItem")
	await import("./store.js")
	expect(read).not.toHaveBeenCalled()
})

test("set notifies once per change and paints the mode", async () => {
	const { theme } = await import("./store.js")
	const heard = vi.fn()
	theme.subscribe(heard)
	expect(theme.mode).toBe("system")
	theme.set("dark")
	expect(heard).toHaveBeenCalledTimes(1)
	expect(document.documentElement.dataset.theme).toBe("dark")
	theme.set("dark")
	expect(heard).toHaveBeenCalledTimes(1)
	expect(theme.resolved).toBe("dark")
})

test("a system preference change notifies once, and resolved follows it", async () => {
	const { theme } = await import("./store.js")
	theme.set("system")
	const heard = vi.fn()
	theme.subscribe(heard)
	expect(theme.resolved).toBe("light")
	dark = true
	for (const listener of changeListeners) listener()
	expect(heard).toHaveBeenCalledTimes(1)
	expect(theme.resolved).toBe("dark")
	for (const listener of changeListeners) listener()
	expect(heard).toHaveBeenCalledTimes(1)
})

test("a system preference change under a forced mode stays quiet", async () => {
	const { theme } = await import("./store.js")
	theme.set("light")
	const heard = vi.fn()
	theme.subscribe(heard)
	dark = true
	for (const listener of changeListeners) listener()
	expect(heard).not.toHaveBeenCalled()
	theme.set("system")
	expect(theme.resolved).toBe("dark")
	expect(heard).toHaveBeenCalledTimes(1)
})
