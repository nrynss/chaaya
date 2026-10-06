import { describe, expect, test } from "vitest"
import { assertErrorEnvelope, assertJobProgress, assertSseFrame } from "./index"

describe("assertSseFrame", () => {
	test("a kept event with an id line passes", () => {
		expect(() =>
			assertSseFrame({ kind: "event", id: 3, name: "alpha", data: '{"n":1}', idSet: true })
		).not.toThrow()
	})

	test("an event with no id line and a bare comment pass", () => {
		expect(() => assertSseFrame({ kind: "event", id: 0, name: "alpha", data: "" })).not.toThrow()
		expect(() => assertSseFrame({ kind: "comment", id: 0, comment: "ping" })).not.toThrow()
	})

	test("a reset frame carries idSet with id 0", () => {
		expect(() =>
			assertSseFrame({ kind: "event", id: 0, name: "alpha", data: "x", idSet: true, resetId: true })
		).not.toThrow()
		expect(() =>
			assertSseFrame({ kind: "event", id: 0, name: "alpha", data: "x", idSet: true })
		).not.toThrow()
	})

	test("a bad kind, a bad id, and bad flags fail", () => {
		expect(() => assertSseFrame(null)).toThrow(/object frame/)
		expect(() => assertSseFrame({ kind: "event", id: 1, name: "a", data: "x" })).not.toThrow()
		expect(() => assertSseFrame({ kind: "unknown", id: 0 })).toThrow(/kind event or comment/)
		expect(() => assertSseFrame({ kind: "event", id: -1, name: "a", data: "x" })).toThrow(/whole-number/)
		expect(() => assertSseFrame({ kind: "event", id: 1.5, name: "a", data: "x" })).toThrow(/whole-number/)
		expect(() =>
			assertSseFrame({ kind: "event", id: 0, name: "a", data: "x", resetId: true })
		).toThrow(/resetId on id 0 with idSet/)
		expect(() =>
			assertSseFrame({ kind: "event", id: 4, name: "a", data: "x", idSet: true, resetId: true })
		).toThrow(/resetId on id 0 with idSet/)
		expect(() =>
			assertSseFrame({ kind: "event", id: 1, name: "a", data: "x", idSet: false })
		).toThrow(/idSet true or absent/)
	})

	test("an event needs a name and data, and no comment text", () => {
		expect(() => assertSseFrame({ kind: "event", id: 0, name: "", data: "x" })).toThrow(/event name/)
		expect(() => assertSseFrame({ kind: "event", id: 0, data: "x" })).toThrow(/event name/)
		expect(() => assertSseFrame({ kind: "event", id: 0, name: "a" })).toThrow(/data string/)
		expect(() => assertSseFrame({ kind: "event", id: 0, name: "a", data: "x", comment: "c" })).toThrow(
			/forbids comment text/
		)
	})

	test("a comment needs text, and no name or data", () => {
		expect(() => assertSseFrame({ kind: "comment", id: 0, comment: "" })).toThrow(/comment text/)
		expect(() => assertSseFrame({ kind: "comment", id: 0 })).toThrow(/comment text/)
		expect(() => assertSseFrame({ kind: "comment", id: 0, comment: "c", name: "a" })).toThrow(
			/forbids a name/
		)
		expect(() => assertSseFrame({ kind: "comment", id: 0, comment: "c", data: "x" })).toThrow(
			/forbids data/
		)
	})
})

describe("assertErrorEnvelope", () => {
	test("a bare body and an envelope both pass", () => {
		expect(() => assertErrorEnvelope({ code: "failed", message: "the work stopped" })).not.toThrow()
		expect(() =>
			assertErrorEnvelope({ code: "failed", message: "the work stopped", retryable: true })
		).not.toThrow()
		expect(() =>
			assertErrorEnvelope({
				code: "failed",
				message: "the work stopped",
				detail: { quote: "q-2" }
			})
		).not.toThrow()
		expect(() =>
			assertErrorEnvelope({ error: { code: "denied", message: "no entry", detail: { again: true } } })
		).not.toThrow()
	})

	test("a missing or empty code and message fail", () => {
		expect(() => assertErrorEnvelope(null)).toThrow(/needs an object/)
		expect(() => assertErrorEnvelope({ message: "the work stopped" })).toThrow(/non-empty code/)
		expect(() => assertErrorEnvelope({ code: "", message: "the work stopped" })).toThrow(
			/non-empty code/
		)
		expect(() => assertErrorEnvelope({ code: 7, message: "the work stopped" })).toThrow(
			/non-empty code/
		)
		expect(() => assertErrorEnvelope({ code: "failed" })).toThrow(/non-empty message/)
		expect(() => assertErrorEnvelope({ code: "failed", message: "" })).toThrow(/non-empty message/)
	})

	test("a non-boolean retryable and a broken envelope fail", () => {
		expect(() => assertErrorEnvelope({ code: "f", message: "m", retryable: "yes" })).toThrow(
			/retryable true or false/
		)
		expect(() => assertErrorEnvelope({ error: "failed" })).toThrow(/non-empty code/)
		expect(() => assertErrorEnvelope({ error: { message: "no entry" } })).toThrow(/non-empty code/)
	})
})

describe("assertJobProgress", () => {
	test("an empty reading and a full reading pass", () => {
		expect(() => assertJobProgress({})).not.toThrow()
		expect(() =>
			assertJobProgress({
				id: "job-1",
				stage: "encode",
				current: 3,
				total: 12,
				status: "running",
				detail: { url: "/media/out.bin" }
			})
		).not.toThrow()
	})

	test("a mistyped field fails", () => {
		expect(() => assertJobProgress(null)).toThrow(/progress object/)
		expect(() => assertJobProgress([])).toThrow(/progress object/)
		expect(() => assertJobProgress({ id: 7 })).toThrow(/id non-empty/)
		expect(() => assertJobProgress({ stage: "" })).toThrow(/stage non-empty/)
		expect(() => assertJobProgress({ status: 3 })).toThrow(/status non-empty/)
		expect(() => assertJobProgress({ current: "3" })).toThrow(/current finite/)
		expect(() => assertJobProgress({ current: Number.NaN })).toThrow(/current finite/)
		expect(() => assertJobProgress({ total: -1 })).toThrow(/total finite/)
		expect(() => assertJobProgress({ total: Number.POSITIVE_INFINITY })).toThrow(/total finite/)
	})

	test("a plain map of handlers passes, including a null prototype", () => {
		const plain = { progress: () => ({ kind: "ignore" as const }) }
		expect(() => assertJobProgress({}, plain)).not.toThrow()
		const bare: Record<string, unknown> = Object.create(null)
		bare.done = () => ({ kind: "ignore" as const })
		expect(() => assertJobProgress({}, bare)).not.toThrow()
	})

	test("a broken map fails", () => {
		expect(() => assertJobProgress({}, null)).toThrow(/frame map object/)
		expect(() => assertJobProgress({}, [])).toThrow(/frame map object/)
		expect(() => assertJobProgress({}, { progress: "handle it" })).toThrow(/handler function at progress/)
		expect(() => assertJobProgress({}, new (class Map {
			progress() {
				return { kind: "ignore" as const }
			}
		})())).toThrow(/plain frame map object/)
	})
})
