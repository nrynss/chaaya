// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { SessionGuard } from "./session-guard.js"

afterEach(() => {
	vi.unstubAllGlobals()
})

test("closed notifies once, and attach returns a teardown that destroys", () => {
	const fetchStub = vi.fn(async () => new Response(null))
	vi.stubGlobal("fetch", fetchStub)
	const guard = new SessionGuard({ url: "https://api.example/close" })
	const heard = vi.fn()
	guard.subscribe(heard)
	const teardown = guard.attach()
	expect(guard.attach()).toBe(teardown)
	window.dispatchEvent(new Event("pagehide"))
	expect(guard.closed).toBe(true)
	expect(heard).toHaveBeenCalledTimes(1)
	teardown()
	guard.close()
	expect(heard).toHaveBeenCalledTimes(1)
	expect(fetchStub).toHaveBeenCalledTimes(1)
})

test("the teardown removes the pagehide listener and sends the close", () => {
	vi.stubGlobal("fetch", vi.fn(async () => new Response(null)))
	const guard = new SessionGuard({ url: "https://api.example/close" })
	const remove = vi.spyOn(window, "removeEventListener")
	guard.attach()()
	expect(remove).toHaveBeenCalledWith("pagehide", expect.any(Function))
	expect(guard.closed).toBe(true)
})
