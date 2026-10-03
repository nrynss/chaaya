import { describe, expect, test } from "vitest"
import { formatNamedFrame, parseNamedFrame, takeFrames } from "./frame"
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

describe("frame writing", () => {
	test("an event frame round-trips through the splitter and the parser", () => {
		const wire = formatNamedFrame({ id: 3, event: "alpha", data: '{"n":1}' })
		const taken = takeFrames(wire)
		expect(taken.rest).toBe("")
		expect(taken.frames).toEqual(['id: 3\nevent: alpha\ndata: {"n":1}'])
		expect(parseNamedFrame(taken.frames[0]!)).toEqual({
			ok: true,
			value: { kind: "event", id: 3, name: "alpha", data: '{"n":1}' },
		})
		expect(parseNamedFrame(wire)).toEqual(parseNamedFrame(taken.frames[0]!))
	})

	test("a comment frame and a second event share one buffer", () => {
		const wire =
			formatNamedFrame({ id: 1, comment: "ping" }) +
			formatNamedFrame({ event: "beta", data: "a\r\nb" })
		const taken = takeFrames(wire)
		expect(taken.rest).toBe("")
		expect(taken.frames).toHaveLength(2)
		expect(parseNamedFrame(taken.frames[0]!)).toEqual({
			ok: true,
			value: { kind: "comment", id: 1, comment: "ping" },
		})
		expect(parseNamedFrame(taken.frames[1]!)).toEqual({
			ok: true,
			value: { kind: "event", id: 0, name: "beta", data: "a\nb" },
		})
	})

	test("a missing id reads back as zero and a bad frame is refused", () => {
		const wire = formatNamedFrame({ event: "alpha" })
		expect(parseNamedFrame(takeFrames(wire).frames[0]!)).toEqual({
			ok: true,
			value: { kind: "event", id: 0, name: "alpha", data: "" },
		})
		expect(() => formatNamedFrame({ id: -1, event: "alpha" })).toThrow(/whole number/)
		expect(() => formatNamedFrame({})).toThrow(/neither an event nor a comment/)
		expect(() => formatNamedFrame({ event: "alpha", comment: "ping" })).toThrow(/either an event or a comment/)
		expect(() => formatNamedFrame({ comment: "ping", data: "x" })).toThrow(/cannot carry data/)
		expect(() => formatNamedFrame({ event: "bad\nname" })).toThrow(/line break/)
	})
})
