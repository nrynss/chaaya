/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest"
import { ApiError } from "../../core/api"
import forbidden from "./wire/fixtures/error-forbidden.json?raw"
import notFound from "./wire/fixtures/error-not-found.json?raw"
import rateLimited from "./wire/fixtures/error-rate-limited.json?raw"
import { api } from "./api"

afterEach(() => {
	vi.unstubAllGlobals()
})

function serve(body: string, status: number, headers?: Record<string, string>): void {
	vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers })))
}

async function caught(run: () => Promise<unknown>): Promise<ApiError> {
	try {
		await run()
	} catch (error) {
		if (error instanceof ApiError) return error
		throw error
	}
	throw new Error("the request resolved where a failure was expected")
}

describe("keel error envelope", () => {
	test("a forbidden response keeps its code, message and detail", async () => {
		serve(forbidden, 403)
		const error = await caught(() => api("/upload"))
		expect(error.code).toBe("forbidden")
		expect(error.status).toBe(403)
		expect(error.message).toBe("This request needs a passcode.")
		expect(error.detail).toEqual({ rule: "upload" })
	})

	test("a not found response reads an absent detail as empty", async () => {
		serve(notFound, 404)
		const error = await caught(() => api("/upload/missing"))
		expect(error.code).toBe("not_found")
		expect(error.status).toBe(404)
		expect(error.message).toBe("No such upload exists.")
		expect(error.detail).toEqual({})
	})

	test("a rate limited response reads the retry hint from the header", async () => {
		serve(rateLimited, 429, { "Retry-After": "12" })
		const error = await caught(() => api("/upload"))
		expect(error.code).toBe("rate_limited")
		expect(error.status).toBe(429)
		expect(error.detail).toEqual({ retry_after_seconds: 12 })
		expect(error.retryAfterSeconds).toBe(12)
	})

	test("a response without an envelope keeps the code http_error", async () => {
		serve("<html>bad gateway</html>", 502)
		const error = await caught(() => api("/upload"))
		expect(error.code).toBe("http_error")
		expect(error.status).toBe(502)
	})
})
