import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isActionFailure, isHttpError } from "@sveltejs/kit"
import { describe, expect, test } from "vitest"
import { ApiError, type ApiErrorParser } from "../core/api.js"
import { GateError } from "../auth/gate.js"
import {
	actionStatus,
	errorFromApiError,
	failFromApiError,
	toActionData,
	type ActionErrorData,
	type ApiErrorInput,
} from "./action.js"

const sampleParser: ApiErrorParser = (text) => {
	const body = JSON.parse(text) as { code?: string; message?: string; detail?: unknown }
	if (typeof body.code !== "string" || typeof body.message !== "string") return undefined
	const parsed: { code: string; message: string; detail?: unknown } = {
		code: body.code,
		message: body.message,
	}
	if (body.detail !== undefined) parsed.detail = body.detail
	return parsed
}

function refused(body: string, status: number, headers?: Record<string, string>): ApiErrorInput {
	return { response: new Response(body, { status, headers }), text: body, parseError: sampleParser }
}

describe("toActionData", () => {
	test("an ApiError keeps its code, message, detail, and retry hint", () => {
		const failure = new ApiError("Slow down.", "rate_limited", 429, { scope: "form" }, 12)
		expect(toActionData(failure)).toEqual({
			code: "rate_limited",
			message: "Slow down.",
			detail: { scope: "form" },
			retryAfterSeconds: 12,
		})
	})

	test("a missing retry hint stays off the data", () => {
		const data = toActionData(new ApiError("No.", "forbidden", 403))
		expect(data.retryAfterSeconds).toBeUndefined()
		expect(data.detail).toEqual({})
	})

	test("a subclass keeps its code", () => {
		const failure = new GateError(new ApiError("Sign in again.", "passcode_required", 401))
		expect(toActionData(failure).code).toBe("passcode_required")
		expect(failure).toBeInstanceOf(ApiError)
	})

	test("a parser supplies the code and a missing parse stays http_error", () => {
		const parsed = toActionData(
			refused('{"code":"validation_failed","message":"The email is missing.","detail":{"field":"email"}}', 422),
		)
		expect(parsed).toEqual({
			code: "validation_failed",
			message: "The email is missing.",
			detail: { field: "email" },
		})
		const plain = toActionData({
			response: new Response("nope", { status: 422 }),
			text: "nope",
		})
		expect(plain.code).toBe("http_error")
		expect(plain.detail).toEqual({})
	})

	test("a response parser runs once for one failure", () => {
		let reads = 0
		const text = '{"code":"forbidden","message":"No."}'
		const result = failFromApiError({
			response: new Response(text, { status: 403 }),
			text,
			parseError() {
				reads += 1
				return { code: "forbidden", message: "No." }
			},
		})
		expect(reads).toBe(1)
		expect(result.data.code).toBe("forbidden")
		expect(result.status).toBe(403)
	})

	test("a parser that throws keeps http_error and the retry hint", () => {
		const data = toActionData({
			response: new Response("<html>", { status: 502, headers: { "Retry-After": "7" } }),
			text: "<html>",
			parseError() {
				throw new SyntaxError("Unexpected token")
			},
		})
		expect(data.code).toBe("http_error")
		expect(data.retryAfterSeconds).toBe(7)
	})

	test("a detail that is not an object reads as empty", () => {
		const data = toActionData(
			refused('{"code":"bad","message":"No.","detail":"nope"}', 400),
		)
		expect(data.detail).toEqual({})
	})

	test("a value that is neither an ApiError nor a response is refused", () => {
		expect(() => toActionData({ text: "nope" } as ApiErrorInput)).toThrow(TypeError)
	})
})

describe("action status", () => {
	test("an HTTP error status passes through and timeout and network map up", () => {
		expect(actionStatus(new ApiError("No.", "forbidden", 403))).toBe(403)
		expect(actionStatus(new ApiError("Gave up.", "timeout", 0))).toBe(504)
		expect(actionStatus(new ApiError("Offline.", "network", 0))).toBe(503)
		expect(actionStatus(new ApiError("Odd.", "moved", 302))).toBe(502)
	})

	test("failFromApiError returns a kit failure with the same code", () => {
		const result = failFromApiError(new ApiError("No.", "forbidden", 403, { scope: "form" }))
		expect(isActionFailure(result)).toBe(true)
		expect(result.status).toBe(403)
		expect(result.data).toEqual({
			code: "forbidden",
			message: "No.",
			detail: { scope: "form" },
		})
	})

	test("a caller may choose the status inside the kit range", () => {
		const result = failFromApiError(new ApiError("Gave up.", "timeout", 0), 400)
		expect(result.status).toBe(400)
		expect(result.data.code).toBe("timeout")
	})

	test("a status outside 400 to 599 is refused", () => {
		const failure = new ApiError("No.", "forbidden", 403)
		expect(() => failFromApiError(failure, 200)).toThrow(RangeError)
		expect(() => failFromApiError(failure, 399)).toThrow(RangeError)
		expect(() => errorFromApiError(failure, 600)).toThrow(RangeError)
	})

	test("errorFromApiError throws a kit HttpError and keeps the code", () => {
		const failure = new ApiError("Slow down.", "rate_limited", 429, {}, 3)
		try {
			errorFromApiError(failure)
			throw new Error("errorFromApiError returned")
		} catch (caught) {
			expect(isHttpError(caught)).toBe(true)
			if (!isHttpError(caught)) throw caught
			expect(caught.status).toBe(429)
			const body = caught.body as ActionErrorData
			expect(body.code).toBe("rate_limited")
			expect(body.message).toBe("Slow down.")
			expect(body.retryAfterSeconds).toBe(3)
		}
	})
})

describe("adapter boundary", () => {
	test("the entry does not import an adapter", () => {
		const root = fileURLToPath(new URL(".", import.meta.url))
		for (const name of ["index.ts", "action.ts"]) {
			const source = readFileSync(join(root, name), "utf8")
			expect(source).not.toMatch(/from\s+["'][^"']*keel/)
		}
	})
})
