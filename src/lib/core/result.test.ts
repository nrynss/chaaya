import { describe, expect, test } from "vitest"
import { decodeJson, fail, formatNamedFrame, isRecord, ok, type ParseResult } from "./index"

describe("parse helpers", () => {
	test("ok, fail, a record check, and json that does not throw", () => {
		const parsed: ParseResult<number> = ok(1)
		expect(parsed).toEqual({ ok: true, value: 1 })
		expect(fail<number>("missing")).toEqual({ ok: false, failure: { message: "missing" } })
		expect(isRecord({ a: 1 })).toBe(true)
		expect(isRecord([])).toBe(false)
		expect(isRecord(null)).toBe(false)
		expect(decodeJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
		expect(decodeJson("no").ok).toBe(false)
		expect(typeof formatNamedFrame).toBe("function")
	})
})
