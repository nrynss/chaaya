/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest"
import forbidden from "../wire/fixtures/error-forbidden.json?raw"
import notFound from "../wire/fixtures/error-not-found.json?raw"
import rateLimited from "../wire/fixtures/error-rate-limited.json?raw"
import { ApiError, api } from "./index"

afterEach(() => {
	vi.unstubAllGlobals()
})

/** Serve one fresh response per call, because a body reads only once. */
function serve(body: string, status: number, headers?: Record<string, string>): void {
	vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers })))
}

/** Hold the request open until its signal aborts, then reject with the reason. */
function hold(_path: string, init?: RequestInit): Promise<never> {
	const { promise, reject } = Promise.withResolvers<never>()
	init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
	return promise
}

/** Return the failure a request produced, and fail the test on a success. */
async function caught(run: () => Promise<unknown>): Promise<ApiError> {
	try {
		await run()
	} catch (error) {
		if (error instanceof ApiError) return error
		throw error
	}
	throw new Error("the request resolved where a failure was expected")
}

describe("error envelope", () => {
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
		expect(error.detail).toEqual({})
	})

	test("a JSON body without an error object keeps the code http_error", async () => {
		serve("{}", 503)
		const error = await caught(() => api("/upload"))
		expect(error.code).toBe("http_error")
		expect(error.status).toBe(503)
	})

	test("a successful response returns the decoded body", async () => {
		serve('{"id":"3f9a"}', 200)
		await expect(api<{ id: string }>("/upload/3f9a")).resolves.toEqual({ id: "3f9a" })
	})
})

describe("failed requests", () => {
	test("a request past its deadline gives up with the code timeout", async () => {
		vi.stubGlobal("fetch", hold)
		const error = await caught(() => api("/slow", { timeoutMs: 20 }))
		expect(error.code).toBe("timeout")
		expect(error.status).toBe(0)
	})

	test("an offline request gives up with the code network", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("fetch failed")
			}),
		)
		const error = await caught(() => api("/upload"))
		expect(error).toBeInstanceOf(ApiError)
		expect(error.code).toBe("network")
		expect(error.status).toBe(0)
	})

	test("a caller signal cancels the request without an ApiError", async () => {
		vi.stubGlobal("fetch", hold)
		const controller = new AbortController()
		const pending = api("/slow", { signal: controller.signal })
		controller.abort()
		await expect(pending).rejects.toHaveProperty("name", "AbortError")
	})

	test("a caller signal alongside a deadline still lets the deadline fire", async () => {
		vi.stubGlobal("fetch", hold)
		const controller = new AbortController()
		const error = await caught(() =>
			api("/slow", { signal: controller.signal, timeoutMs: 20 }),
		)
		expect(error.code).toBe("timeout")
	})
})
