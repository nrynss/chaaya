/// <reference types="vite/client" />
import { describe, expect, test } from "vitest"
import forbidden from "./fixtures/error-forbidden.json?raw"
import notFound from "./fixtures/error-not-found.json?raw"
import rateLimited from "./fixtures/error-rate-limited.json?raw"
import cancelled from "./fixtures/event-cancelled.txt?raw"
import done from "./fixtures/event-done.txt?raw"
import errorEvent from "./fixtures/event-error.txt?raw"
import heartbeat from "./fixtures/event-heartbeat.txt?raw"
import interrupted from "./fixtures/event-interrupted.txt?raw"
import progress from "./fixtures/event-progress.txt?raw"
import { parseErrorEnvelope, parseJobEvent, type JobEvent } from "./index"

const jobId = "3f9a1c7e5b2d8046a1c3e5f7092b4d68"

describe("error envelope", () => {
	test("a forbidden response keeps its code and detail", () => {
		expect(parseErrorEnvelope(forbidden)).toEqual({
			ok: true,
			value: { error: { code: "forbidden", message: "This request needs a passcode.", detail: { rule: "upload" } } },
		})
	})

	test("a not found response omits the detail member", () => {
		expect(parseErrorEnvelope(notFound)).toEqual({
			ok: true,
			value: { error: { code: "not_found", message: "No such upload exists." } },
		})
	})

	test("a rate limited response keeps the retry hint", () => {
		expect(parseErrorEnvelope(rateLimited)).toEqual({
			ok: true,
			value: {
				error: { code: "rate_limited", message: "Too many requests.", detail: { retry_after_seconds: 12 } },
			},
		})
	})

	test("a body without an error object is a failure", () => {
		expect(parseErrorEnvelope("{}").ok).toBe(false)
	})

	test("a body that is not JSON is a failure", () => {
		expect(parseErrorEnvelope("{not json").ok).toBe(false)
	})
})

describe("job events", () => {
	test("a progress frame parses its counter and detail", () => {
		expect(parseJobEvent(progress)).toEqual<{ ok: true; value: JobEvent }>({
			ok: true,
			value: { id: 3, name: "progress", jobId, stage: "transcoding", current: 4, total: 12, detail: { pass: "loudness" } },
		})
	})

	test("a done frame parses its terminal status", () => {
		expect(parseJobEvent(done)).toEqual<{ ok: true; value: JobEvent }>({
			ok: true,
			value: { id: 4, name: "done", jobId, status: "done" },
		})
	})

	test("a cancelled frame parses its terminal status", () => {
		expect(parseJobEvent(cancelled)).toEqual<{ ok: true; value: JobEvent }>({
			ok: true,
			value: { id: 2, name: "cancelled", jobId, status: "cancelled" },
		})
	})

	test("an interrupted frame parses its terminal status", () => {
		expect(parseJobEvent(interrupted)).toEqual<{ ok: true; value: JobEvent }>({
			ok: true,
			value: { id: 7, name: "interrupted", jobId, status: "interrupted" },
		})
	})

	test("an error frame parses the inner envelope", () => {
		expect(parseJobEvent(errorEvent)).toEqual<{ ok: true; value: JobEvent }>({
			ok: true,
			value: {
				id: 5,
				name: "error",
				jobId,
				status: "error",
				error: { error: { code: "upstream_failed", message: "The media service failed.", detail: { attempts: 3 } } },
			},
		})
	})

	test("a heartbeat parses from its comment line", () => {
		expect(parseJobEvent(heartbeat)).toEqual<{ ok: true; value: JobEvent }>({
			ok: true,
			value: { id: 0, name: "heartbeat", comment: "ping" },
		})
	})
})

describe("malformed input", () => {
	test("a truncated data frame returns a failure", () => {
		const frame = 'event: progress\nid: 3\ndata: {"job_id":"3f9a1c7e5b2d8046a1c3e5f7092b4d68","stage":"transcod'
		const result = parseJobEvent(frame)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.failure.message).toContain("JSON")
	})

	test("a status data that disagrees with its event name is a failure", () => {
		expect(parseJobEvent('event: done\nid: 4\ndata: {"job_id":"abc","status":"cancelled"}\n\n').ok).toBe(false)
	})

	test("an event frame without data is a failure", () => {
		expect(parseJobEvent("event: done\nid: 4\n\n").ok).toBe(false)
	})

	test("an unknown event name is a failure", () => {
		expect(parseJobEvent('event: mystery\nid: 1\ndata: {"job_id":"abc"}\n\n').ok).toBe(false)
	})
})
