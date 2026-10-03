import { expect, test } from "vitest"
import { nextRecordingPhase, type RecordingEvent, type RecordingPhase } from "./phase.js"

const PHASES: RecordingPhase[] = [
	"idle",
	"recording",
	"paused",
	"uploading",
	"done",
	"failed",
	"cancelled"
]

const EVENTS: RecordingEvent[] = [
	"start",
	"pause",
	"resume",
	"stop",
	"uploaded",
	"fail",
	"cancel",
	"reset"
]

function expectOnly(event: RecordingEvent, allowed: Partial<Record<RecordingPhase, RecordingPhase>>): void {
	for (const phase of PHASES) {
		const next = allowed[phase] ?? (event === "reset" ? "idle" : phase)
		expect(nextRecordingPhase(phase, event), `${phase} + ${event}`).toBe(next)
	}
}

test("start only leaves idle", () => {
	expectOnly("start", { idle: "recording" })
})

test("pause only holds a running take", () => {
	expectOnly("pause", { recording: "paused" })
})

test("resume only continues a held take", () => {
	expectOnly("resume", { paused: "recording" })
})

test("stop uploads a running or held take", () => {
	expectOnly("stop", { recording: "uploading", paused: "uploading" })
})

test("uploaded finishes only an upload", () => {
	expectOnly("uploaded", { uploading: "done" })
})

test("fail covers the open phases and leaves a terminal phase alone", () => {
	expectOnly("fail", {
		idle: "failed",
		recording: "failed",
		paused: "failed",
		uploading: "failed"
	})
})

test("cancel covers a take that has entered recording or upload", () => {
	expectOnly("cancel", {
		recording: "cancelled",
		paused: "cancelled",
		uploading: "cancelled"
	})
})

test("reset returns every phase to idle", () => {
	for (const phase of PHASES) expect(nextRecordingPhase(phase, "reset")).toBe("idle")
	expect(EVENTS).toHaveLength(8)
})
