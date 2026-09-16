import { expect, test } from "vitest"
import { nextState } from "./state"
import type { CaptureState } from "./types"

const EVERY_STATE: CaptureState[] = [
	"idle",
	"requesting",
	"recording",
	"denied",
	"stopped",
	"failed"
]

test("a start opens a microphone from any finished take", () => {
	for (const state of EVERY_STATE) {
		const expected = state === "requesting" || state === "recording" ? state : "requesting"
		expect(nextState(state, "start")).toBe(expected)
	}
})

test("a granted microphone only moves a pending take into recording", () => {
	expect(nextState("requesting", "granted")).toBe("recording")
	for (const state of EVERY_STATE.filter((value) => value !== "requesting")) {
		expect(nextState(state, "granted")).toBe(state)
	}
})

test("a refused grant ends a pending take in denied", () => {
	expect(nextState("requesting", "denied")).toBe("denied")
	expect(nextState("recording", "denied")).toBe("recording")
})

test("a lost device ends a pending or running take in failed", () => {
	expect(nextState("requesting", "failed")).toBe("failed")
	expect(nextState("recording", "failed")).toBe("failed")
	expect(nextState("denied", "failed")).toBe("denied")
	expect(nextState("stopped", "failed")).toBe("stopped")
})

test("a finished take only moves a running take into stopped", () => {
	expect(nextState("recording", "finished")).toBe("stopped")
	for (const state of EVERY_STATE.filter((value) => value !== "recording")) {
		expect(nextState(state, "finished")).toBe(state)
	}
})

test("a reset drops every take back to idle", () => {
	for (const state of EVERY_STATE) expect(nextState(state, "reset")).toBe("idle")
})
