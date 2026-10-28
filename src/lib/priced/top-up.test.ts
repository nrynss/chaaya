// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { consumeTopUpReturn } from "./top-up.js"

afterEach(() => {
	window.history.replaceState(null, "", "/")
})

test("reads the reference once and drops only that param", () => {
	window.history.replaceState({ kept: 1 }, "", "/wallet?topup=ref-1&tab=credits#top")
	expect(consumeTopUpReturn(undefined, { param: "topup" })).toBe("ref-1")
	expect(window.location.pathname).toBe("/wallet")
	expect(window.location.search).toBe("?tab=credits")
	expect(window.location.hash).toBe("#top")
	expect(window.history.state).toEqual({ kept: 1 })
	expect(consumeTopUpReturn(undefined, { param: "topup" })).toBeUndefined()
})

test("answers undefined off the return path and leaves the address bar", () => {
	window.history.replaceState(null, "", "/elsewhere?topup=ref-1")
	expect(consumeTopUpReturn(undefined, { param: "topup", path: "/wallet" })).toBeUndefined()
	expect(window.location.search).toBe("?topup=ref-1")
})

test("answers undefined for a missing or blank reference", () => {
	expect(consumeTopUpReturn("https://app.test/wallet?other=1", { param: "topup" })).toBeUndefined()
	window.history.replaceState(null, "", "/wallet?topup=%20")
	expect(consumeTopUpReturn(undefined, { param: "topup" })).toBeUndefined()
	expect(window.location.search).toBe("?topup=%20")
})

test("reads a passed URL and trims the reference", () => {
	expect(consumeTopUpReturn(new URL("https://app.test/wallet?topup=%20ref-2%20"), { param: "topup", path: "/wallet" })).toBe("ref-2")
	expect(window.location.pathname).toBe("/wallet")
	expect(window.location.search).toBe("")
})
