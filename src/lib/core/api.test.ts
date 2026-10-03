/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest"
import { ApiError, api, type ApiErrorParser } from "./api"

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

const sampleParser: ApiErrorParser = (text) => {
	const body = JSON.parse(text) as { code?: string; message?: string }
	if (typeof body.code !== "string" || typeof body.message !== "string") return undefined
	return { code: body.code, message: body.message }
}

describe("responses", () => {
	test("a JSON body is not read as an envelope unless a parser is passed", async () => {
		serve('{"error":{"code":"forbidden","message":"This request was refused."}}', 403)
		const error = await caught(() => api("/upload"))
		expect(error.code).toBe("http_error")
		expect(error.status).toBe(403)
		expect(error.detail).toEqual({})
	})

	test("a parser supplies the stable code and a missing parse stays http_error", async () => {
		serve('{"code":"forbidden","message":"This request was refused."}', 403)
		const parsed = await caught(() => api("/upload", { parseError: sampleParser }))
		expect(parsed.code).toBe("forbidden")
		expect(parsed.message).toBe("This request was refused.")
		expect(parsed.status).toBe(403)
		const plain = await caught(() => api("/upload"))
		expect(plain.code).toBe("http_error")
	})

	test("a rate limited response keeps the retry hint even when the body is not parsed", async () => {
		serve("{}", 429, { "Retry-After": "12" })
		const error = await caught(() => api("/upload"))
		expect(error.code).toBe("http_error")
		expect(error.status).toBe(429)
		expect(error.retryAfterSeconds).toBe(12)
	})

	test("a response without a parser keeps the code http_error", async () => {
		serve("<html>bad gateway</html>", 502)
		const error = await caught(() => api("/upload"))
		expect(error.code).toBe("http_error")
		expect(error.status).toBe(502)
		expect(error.detail).toEqual({})
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
