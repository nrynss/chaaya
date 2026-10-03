import { afterEach, describe, expect, test, vi } from "vitest"
import { ApiError } from "../core/api"
import { apiWithGate, GateError, GatePasscode, readCookie, readSetCookie, type CookieTarget } from "./gate"

const headerName = "X-App-Passcode"
const cookieName = "app_gate"

afterEach(() => {
	vi.unstubAllGlobals()
})

function gate(options: Partial<ConstructorParameters<typeof GatePasscode>[0]> = {}) {
	return new GatePasscode({ headerName, cookieName, ...options })
}

describe("gate passcode", () => {
	test("empty names are refused and apply sends the caller's header", () => {
		expect(() => new GatePasscode({ headerName: "", cookieName })).toThrow(/header name/)
		const helper = gate({ initial: "open-sesame" })
		const init = helper.apply({ method: "POST" })
		expect(new Headers(init.headers).get(headerName)).toBe("open-sesame")
		expect(init.credentials).toBeUndefined()
		expect(helper.apply({}).credentials).toBeUndefined()
		expect(helper.apply({ credentials: "include" }).credentials).toBe("include")
		expect(new Headers(helper.apply().headers).has("X-Passcode")).toBe(false)
	})

	test("a caller header is left alone and an empty store omits the header", () => {
		const helper = gate()
		expect(new Headers(helper.apply().headers).has(headerName)).toBe(false)
		helper.set("open-sesame")
		const init = helper.apply({ headers: { [headerName]: "caller" }, credentials: "omit" })
		expect(new Headers(init.headers).get(headerName)).toBe("caller")
		expect(init.credentials).toBe("omit")
	})

	test("set mirrors the value into the cookie jar", () => {
		const jar: CookieTarget = { cookie: "" }
		const helper = gate({ jar, initial: "moon-mango" })
		expect(readCookie(jar.cookie, cookieName)).toBe("moon-mango")
		const again = gate({ jar: { cookie: "app_gate=moon-mango" } })
		expect(again.value).toBe("moon-mango")
		helper.clear()
		expect(helper.value).toBe("")
	})

	test("a line break is refused", () => {
		const helper = gate()
		expect(() => helper.set("open\nsesame")).toThrow(/line break/)
	})

	test("remember keeps a Set-Cookie value where the runtime still exposes it", () => {
		const helper = gate()
		const fromCookie = new Response("{}", { headers: { "set-cookie": 'app_gate="open-sesame"; Path=/' } })
		expect(readCookie('app_gate="open-sesame"', cookieName)).toBe("open-sesame")
		expect(readSetCookie(fromCookie.headers, cookieName)).toBe("open-sesame")
		expect(helper.remember(fromCookie, { passcode: "from-body" })).toBe(true)
		expect(helper.value).toBe("open-sesame")
	})

	test("a hidden Set-Cookie does not count, and the JSON member does", () => {
		const helper = gate()
		const hidden = {
			headers: {
				get() {
					return null
				},
				getSetCookie() {
					return []
				},
			},
		} as unknown as Response
		expect(readSetCookie(hidden.headers, cookieName)).toBeUndefined()
		expect(helper.remember(hidden, { passcode: "from-body" })).toBe(true)
		expect(helper.value).toBe("from-body")
		expect(helper.remember(new Response("{}"))).toBe(false)
	})

	test("a listed auth code becomes GateError and keeps detail and retry delay", async () => {
		const call = apiWithGate(gate({ authCodes: ["slow"] }), async () => {
			throw new ApiError("wait", "slow", 429, { reason: "slow" }, 12)
		})
		await expect(call("/render")).rejects.toMatchObject({
			name: "GateError",
			code: "slow",
			status: 429,
			detail: { reason: "slow" },
			retryAfterSeconds: 12,
		})
		await expect(call("/render")).rejects.toBeInstanceOf(GateError)
		await expect(call("/render")).rejects.toBeInstanceOf(ApiError)
	})

	test("an unlisted refusal stays ApiError, including a prototype-looking code", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403 })))
		const plain = apiWithGate(gate())
		await expect(plain("/render")).rejects.toBeInstanceOf(ApiError)
		const inherited = apiWithGate(gate({ authCodes: [] }), async () => {
			throw new ApiError("no", "toString", 403)
		})
		await expect(inherited("/render")).rejects.toBeInstanceOf(ApiError)
	})
})
