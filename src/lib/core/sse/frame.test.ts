import { describe, expect, test } from "vitest"
import { parseNamedFrame, takeFrames } from "./frame"
import { reconnectDelay, reconnectSettings } from "./reconnect"

describe("named frames", () => {
	test("an event keeps its name and a comment stays a comment", () => {
		expect(parseNamedFrame('event: alpha\nid: 3\ndata: {"n":1}')).toEqual({
			ok: true,
			value: { kind: "event", id: 3, name: "alpha", data: '{"n":1}' },
		})
		expect(parseNamedFrame(": ping")).toEqual({
			ok: true,
			value: { kind: "comment", id: 0, comment: "ping" },
		})
		expect(parseNamedFrame("id: no").ok).toBe(false)
		expect(parseNamedFrame("id: 4").ok).toBe(false)
	})

	test("two frames leave no tail", () => {
		const taken = takeFrames("event: alpha\n\nevent: beta\n\n")
		expect(taken.frames).toEqual(["event: alpha", "event: beta"])
		expect(taken.rest).toBe("")
	})
})

describe("reconnect schedule", () => {
	test("omitted fields keep the shared defaults and the delay doubles", () => {
		const settings = reconnectSettings()
		expect(settings).toEqual({ baseMs: 500, maxMs: 8000, attempts: 6 })
		expect(reconnectDelay(0, settings)).toBe(500)
		expect(reconnectDelay(1, settings)).toBe(1000)
		expect(reconnectDelay(8, settings)).toBe(8000)
		expect(reconnectSettings({ baseMs: 0, attempts: 1 }).attempts).toBe(1)
	})
})
