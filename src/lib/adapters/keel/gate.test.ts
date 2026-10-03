import { afterEach, describe, expect, test, vi } from "vitest"
import { ApiError } from "../../core/api"
import { GateError } from "../../auth/gate"
import { apiWithKeelGate, keelGate, keelPasscodeCookie, keelPasscodeHeader } from "./gate"

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("keel gate", () => {
	test("the helper uses Keel's header and cookie unless the caller overrides them", () => {
		const gate = keelGate({ initial: "open-sesame" })
		expect(gate.headerName).toBe(keelPasscodeHeader)
		expect(gate.cookieName).toBe(keelPasscodeCookie)
		expect(new Headers(gate.apply().headers).get("X-Passcode")).toBe("open-sesame")
		const custom = keelGate({ headerName: "X-Other", cookieName: "other" })
		expect(custom.headerName).toBe("X-Other")
	})

	test("passcode_required from the Keel envelope is a GateError", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						'{"error":{"code":"passcode_required","message":"This request needs a passcode.","detail":{"scope":"render"}}}',
						{ status: 403, headers: { "retry-after": "3" } },
					),
			),
		)
		const call = apiWithKeelGate(keelGate())
		await expect(call("/render")).rejects.toMatchObject({
			name: "GateError",
			code: "passcode_required",
			status: 403,
			detail: { scope: "render" },
			retryAfterSeconds: 3,
		})
		await expect(call("/render")).rejects.toBeInstanceOf(GateError)
		await expect(call("/render")).rejects.toBeInstanceOf(ApiError)
	})
})
