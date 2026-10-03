import { expect, test } from "vitest"
import type { CaptureResult, CaptureState } from "../capture/types.js"
import { captureFromRecorder, type RecordingSource } from "./port.js"
import {
	RecordingCancelled,
	RecordingSessionError,
	createRecordingSession,
	type RecordingCapture,
	type RecordingUpload
} from "./session.js"

function take(): CaptureResult {
	return {
		blob: new Blob(["take"], { type: "audio/webm" }),
		mimeType: "audio/webm",
		sampleRate: 48000
	}
}

interface Rig {
	capture: RecordingCapture
	upload: RecordingUpload
	sent: CaptureResult[]
	resets: () => number
	deny: () => void
	throwOnStart: () => void
	holdSend: () => void
	releaseSend: () => void
	failSend: () => void
	dropBytes: () => void
}

function rig(options?: { pause?: boolean }): Rig {
	let running = false
	let result: CaptureResult | null = null
	let error: unknown = null
	let startMode: "ok" | "throw" | "deny" = "ok"
	let sendMode: "ok" | "hold" | "fail" = "ok"
	let keep = true
	let resetCount = 0
	let heldSend: { finish: () => void; reject: (error: unknown) => void } | null = null
	const sent: CaptureResult[] = []

	const capture: RecordingCapture = {
		async start() {
			if (startMode === "throw") {
				startMode = "ok"
				throw new Error("no microphone")
			}
			if (startMode === "deny") {
				error = new Error("denied")
				running = false
				return
			}
			error = null
			running = true
		},
		running: () => running,
		async stop() {
			running = false
			result = keep ? take() : null
		},
		reset() {
			resetCount += 1
			running = false
			result = null
		},
		take: () => result,
		captureError: () => error
	}

	if (options?.pause) {
		capture.pause = async () => undefined
		capture.resume = async () => {
			running = true
		}
	}

	const upload: RecordingUpload = {
		send(body, signal) {
			return new Promise<void>((resolve, reject) => {
				const succeed = (): void => {
					sent.push(body)
					resolve()
				}
				const fail = (cause: unknown): void => reject(cause)
				if (signal.aborted) {
					fail(new Error("aborted"))
					return
				}
				signal.addEventListener("abort", () => fail(new Error("aborted")), { once: true })
				if (sendMode === "fail") {
					fail(new Error("upload failed"))
					return
				}
				if (sendMode === "hold") {
					heldSend = { finish: succeed, reject: fail }
					return
				}
				succeed()
			})
		}
	}

	return {
		capture,
		upload,
		sent,
		resets: () => resetCount,
		deny: () => {
			startMode = "deny"
		},
		throwOnStart: () => {
			startMode = "throw"
		},
		holdSend: () => {
			sendMode = "hold"
		},
		releaseSend: () => {
			const pending = heldSend
			heldSend = null
			pending?.finish()
		},
		failSend: () => {
			sendMode = "fail"
		},
		dropBytes: () => {
			keep = false
		}
	}
}

/** A capture whose start stays pending until `open` runs. */
function deferredStart(base: RecordingCapture): { capture: RecordingCapture; open: () => void } {
	let open = (): void => undefined
	const capture: RecordingCapture = {
		...base,
		start: () =>
			new Promise<void>((resolve, reject) => {
				open = () => {
					void base.start().then(resolve, reject)
				}
			})
	}
	return { capture, open: () => open() }
}

test("a take runs, pauses, resumes, uploads, and finishes", async () => {
	const box = rig({ pause: true })
	const seen: string[] = []
	const session = createRecordingSession({ capture: box.capture, upload: box.upload })
	session.subscribe((phase) => seen.push(phase))
	await session.start()
	expect(session.phase).toBe("recording")
	await session.pause()
	expect(session.phase).toBe("paused")
	await session.resume()
	expect(session.phase).toBe("recording")
	await session.stop()
	expect(session.phase).toBe("done")
	expect(session.error).toBeNull()
	expect(session.result?.mimeType).toBe("audio/webm")
	expect(box.sent).toHaveLength(1)
	expect(seen).toEqual(["recording", "paused", "recording", "uploading", "uploading", "done"])
})

test("commands outside their phase throw and leave the phase alone", async () => {
	const box = rig({ pause: true })
	const session = createRecordingSession({ capture: box.capture, upload: box.upload })
	await expect(session.stop()).rejects.toMatchObject({ code: "illegal", phase: "idle" })
	await expect(session.pause()).rejects.toMatchObject({ code: "illegal" })
	expect(() => session.cancel()).toThrow(RecordingSessionError)
	await session.start()
	await expect(session.start()).rejects.toMatchObject({ code: "illegal", phase: "recording" })
	await session.pause()
	await expect(session.pause()).rejects.toMatchObject({ code: "illegal", phase: "paused" })
	await session.resume()
	await expect(session.resume()).rejects.toMatchObject({ code: "illegal", phase: "recording" })
	await session.stop()
	expect(() => session.cancel()).toThrow(/done/)
	expect(session.phase).toBe("done")
})

test("a capture port without pause refuses pause and keeps recording", async () => {
	const box = rig()
	const session = createRecordingSession({ capture: box.capture, upload: box.upload })
	await session.start()
	await expect(session.pause()).rejects.toMatchObject({
		code: "pause_unsupported",
		phase: "recording"
	})
	expect(session.phase).toBe("recording")
	await session.stop()
	expect(session.phase).toBe("done")
})

test("a second start while the microphone is opening is busy", async () => {
	const box = rig()
	const deferred = deferredStart(box.capture)
	const session = createRecordingSession({ capture: deferred.capture, upload: box.upload })
	const first = session.start()
	await expect(session.start()).rejects.toMatchObject({ code: "busy", phase: "idle" })
	deferred.open()
	await first
	expect(session.phase).toBe("recording")
})

test("cancel while the microphone is opening ends cancelled", async () => {
	const box = rig()
	const deferred = deferredStart(box.capture)
	const session = createRecordingSession({ capture: deferred.capture, upload: box.upload })
	const first = session.start()
	session.cancel()
	expect(session.phase).toBe("cancelled")
	deferred.open()
	await expect(first).rejects.toBeInstanceOf(RecordingCancelled)
	expect(session.phase).toBe("cancelled")
	expect(box.resets()).toBeGreaterThan(0)
	session.reset()
	expect(session.phase).toBe("idle")
	expect(session.error).toBeNull()
})

test("a thrown start fails the session from idle", async () => {
	const box = rig()
	box.throwOnStart()
	const session = createRecordingSession({ capture: box.capture, upload: box.upload })
	await expect(session.start()).rejects.toThrow(/microphone/)
	expect(session.phase).toBe("failed")
	expect(session.error).toBeInstanceOf(Error)
	session.reset()
	await session.start()
	expect(session.phase).toBe("recording")
})

test("a start that resolves without a running take fails and keeps the capture error", async () => {
	const box = rig()
	box.deny()
	const session = createRecordingSession({ capture: box.capture, upload: box.upload })
	await expect(session.start()).rejects.toThrow(/denied/)
	expect(session.phase).toBe("failed")
	expect((session.error as Error).message).toBe("denied")
})

test("cancel during upload aborts the send and discards the bytes", async () => {
	const box = rig()
	box.holdSend()
	const session = createRecordingSession({ capture: box.capture, upload: box.upload })
	await session.start()
	const stopping = session.stop()
	await Promise.resolve()
	expect(session.phase).toBe("uploading")
	session.cancel()
	await expect(stopping).rejects.toBeInstanceOf(RecordingCancelled)
	expect(session.phase).toBe("cancelled")
	expect(session.result).toBeNull()
	expect(session.error).toBeNull()
	expect(box.sent).toHaveLength(0)
})

test("a failed upload keeps the bytes and lands on failed", async () => {
	const box = rig()
	box.failSend()
	const session = createRecordingSession({ capture: box.capture, upload: box.upload })
	await session.start()
	await expect(session.stop()).rejects.toThrow(/upload failed/)
	expect(session.phase).toBe("failed")
	expect(session.result?.mimeType).toBe("audio/webm")
	expect(box.sent).toHaveLength(0)
})

test("a take with no bytes fails before upload", async () => {
	const box = rig()
	box.dropBytes()
	const session = createRecordingSession({ capture: box.capture, upload: box.upload })
	await session.start()
	await expect(session.stop()).rejects.toMatchObject({ code: "empty_take" })
	expect(session.phase).toBe("failed")
	expect(box.sent).toHaveLength(0)
})

test("reset during upload returns to idle and the stop loses", async () => {
	const box = rig()
	box.holdSend()
	const session = createRecordingSession({ capture: box.capture, upload: box.upload })
	await session.start()
	const stopping = session.stop()
	await Promise.resolve()
	session.reset()
	await expect(stopping).rejects.toBeInstanceOf(RecordingCancelled)
	expect(session.phase).toBe("idle")
	expect(session.result).toBeNull()
})

test("a listener that throws does not fail the take", async () => {
	const box = rig()
	const session = createRecordingSession({ capture: box.capture, upload: box.upload })
	session.subscribe(() => {
		throw new Error("paint")
	})
	await session.start()
	expect(session.phase).toBe("recording")
})

test("captureFromRecorder treats only a recording state as running and does not pause", async () => {
	let state: CaptureState = "denied"
	const source: RecordingSource = {
		get state() {
			return state
		},
		result: null,
		error: new Error("no"),
		start: async () => undefined,
		stop: async () => undefined,
		reset: () => undefined
	}
	const port = captureFromRecorder(source)
	await port.start()
	expect(port.running()).toBe(false)
	expect(port.captureError()).toBeInstanceOf(Error)
	expect(port.pause).toBeUndefined()
	expect(port.resume).toBeUndefined()
	state = "recording"
	expect(port.running()).toBe(true)
})
