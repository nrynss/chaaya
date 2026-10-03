/// <reference types="vite/client" />
import { describe, expect, test } from "vitest"
import cancelled from "../wire/fixtures/event-cancelled.txt?raw"
import done from "../wire/fixtures/event-done.txt?raw"
import errorEvent from "../wire/fixtures/event-error.txt?raw"
import heartbeat from "../wire/fixtures/event-heartbeat.txt?raw"
import interrupted from "../wire/fixtures/event-interrupted.txt?raw"
import progress from "../wire/fixtures/event-progress.txt?raw"
import { parseJobEvent } from "../wire"
import { isTerminalStatus, JobFollower, takeFrames, type JobReport } from "./follow"

const jobId = "3f9a1c7e5b2d8046a1c3e5f7092b4d68"
const otherJobId = "9c1d5a3b7e2f40689b0d2c4e6f8a1b35"

/** Parse a fixture frame into the event a follower accepts. */
function report(text: string): JobReport {
	const parsed = parseJobEvent(text)
	if (!parsed.ok) throw new Error(parsed.failure.message)
	if (parsed.value.name === "heartbeat") throw new Error("a heartbeat carries no job report")
	return parsed.value
}

describe("frame splitting", () => {
	test("two frames in one buffer leave no tail", () => {
		const taken = takeFrames(progress + done)
		expect(taken.frames).toHaveLength(2)
		expect(taken.frames[0]).toContain("event: progress")
		expect(taken.frames[1]).toContain("event: done")
		expect(taken.rest).toBe("")
	})

	test("an unterminated frame stays in the buffer", () => {
		const text = done.trimEnd()
		expect(takeFrames(text)).toEqual({ frames: [], rest: text })
	})

	test("a blank line closes a frame on either ending", () => {
		const taken = takeFrames(`${progress.trimEnd()}\r\n\r\n`)
		expect(taken.frames).toHaveLength(1)
		expect(taken.rest).toBe("")
	})

	test("a run of blank lines adds no frame", () => {
		const taken = takeFrames(`\n\n${done}`)
		expect(taken.frames).toHaveLength(1)
		expect(taken.frames[0]).toContain("event: done")
		expect(taken.rest).toBe("")
	})

	test("a comment frame and a job frame split apart", () => {
		const taken = takeFrames(heartbeat + done)
		expect(taken.frames[0]).toBe(": ping")
		expect(taken.frames[1]).toContain("event: done")
	})

	test("a tail after the last frame stays whole", () => {
		const taken = takeFrames(`${heartbeat}event: done\nid: 4`)
		expect(taken.frames).toEqual([": ping"])
		expect(taken.rest).toBe("event: done\nid: 4")
	})
})

describe("job follower", () => {
	test("allows does not record the frame", () => {
		const follower = new JobFollower()
		const event = report(progress)
		expect(follower.allows(event)).toBe(true)
		expect(follower.lastEventId).toBe(0)
		expect(follower.jobId).toBeUndefined()
		expect(follower.accept(event)).toBe(true)
		expect(follower.allows(event)).toBe(false)
	})

	test("a frame lands once and keeps its id and its job", () => {
		const follower = new JobFollower()
		expect(follower.accept(report(progress))).toBe(true)
		expect(follower.lastEventId).toBe(3)
		expect(follower.jobId).toBe(jobId)
		expect(follower.ended).toBe(false)
	})

	test("a repeat of one id is refused", () => {
		const follower = new JobFollower()
		follower.accept(report(progress))
		expect(follower.accept(report(progress))).toBe(false)
		expect(follower.lastEventId).toBe(3)
	})

	test("an older id is refused", () => {
		const follower = new JobFollower()
		follower.accept(report(progress))
		expect(follower.accept(report(cancelled))).toBe(false)
		expect(follower.lastEventId).toBe(3)
		expect(follower.ended).toBe(false)
	})

	test("a frame for another job is refused", () => {
		const follower = new JobFollower()
		follower.accept(report(progress))
		const foreign = report(interrupted.split(jobId).join(otherJobId))
		expect(follower.accept(foreign)).toBe(false)
		expect(follower.ended).toBe(false)
	})

	test("the first terminal ends the job and a later one is refused", () => {
		const follower = new JobFollower()
		expect(follower.accept(report(done))).toBe(true)
		expect(follower.ended).toBe(true)
		expect(follower.accept(report(interrupted))).toBe(false)
		expect(follower.lastEventId).toBe(4)
	})

	test("an error frame ends the job", () => {
		const follower = new JobFollower()
		expect(follower.accept(report(errorEvent))).toBe(true)
		expect(follower.ended).toBe(true)
		expect(follower.accept(report(progress))).toBe(false)
	})

	test("progress never ends the job", () => {
		const follower = new JobFollower()
		expect(follower.accept(report(progress))).toBe(true)
		expect(follower.ended).toBe(false)
		expect(follower.accept(report(interrupted))).toBe(true)
		expect(follower.ended).toBe(true)
	})
})

describe("terminal status", () => {
	test("every ending status ends the job", () => {
		expect(isTerminalStatus("done")).toBe(true)
		expect(isTerminalStatus("error")).toBe(true)
		expect(isTerminalStatus("cancelled")).toBe(true)
		expect(isTerminalStatus("interrupted")).toBe(true)
	})

	test("no live status ends the job", () => {
		expect(isTerminalStatus("queued")).toBe(false)
		expect(isTerminalStatus("running")).toBe(false)
	})
})
