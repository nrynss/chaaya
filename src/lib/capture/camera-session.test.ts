import { afterEach, expect, test, vi } from "vitest"
import { CameraSession } from "./camera-session.svelte.js"
import { fileBackend, nativeBackend, sessionBackend } from "./seam.js"

afterEach(() => {
	vi.unstubAllGlobals()
})

/** A track the session may stop. */
function fakeTrack(): MediaStreamTrack {
	const track = {
		readyState: "live",
		stop: vi.fn(() => {
			track.readyState = "ended"
		})
	}
	return track as unknown as MediaStreamTrack
}

/** A stream of two live tracks. */
function fakeStream(): { stream: MediaStream; tracks: MediaStreamTrack[] } {
	const first = fakeTrack()
	const second = fakeTrack()
	const stream = {
		getTracks: () => [first, second]
	}
	return { stream: stream as unknown as MediaStream, tracks: [first, second] }
}

/** A video element with a frame ready. */
function fakeVideo(width: number, height: number): HTMLVideoElement {
	const video = {
		videoWidth: width,
		videoHeight: height,
		srcObject: null,
		playsInline: false,
		play: async () => undefined,
		pause: () => undefined
	}
	return video as unknown as HTMLVideoElement
}

/** Answer every grant with the stream and remember the constraints. */
function installGrant(stream: MediaStream, seen: unknown[]): void {
	vi.stubGlobal("navigator", {
		mediaDevices: {
			getUserMedia: async (constraints: unknown) => {
				seen.push(constraints)
				return stream
			}
		}
	})
}

/** Refuse every grant with the named error. */
function installRefusal(name: string): void {
	vi.stubGlobal("navigator", {
		mediaDevices: {
			getUserMedia: async () => {
				throw new DOMException("The camera grant was refused.", name)
			}
		}
	})
}

test("start opens the front lens and goes live", async () => {
	const { stream } = fakeStream()
	const seen: unknown[] = []
	installGrant(stream, seen)
	const session = new CameraSession()
	session.bind(fakeVideo(640, 480))
	await session.start()
	expect(session.phase).toBe("live")
	expect(session.facing).toBe("user")
	expect(session.reason).toBe("")
	expect(seen).toEqual([{ video: { facingMode: "user" }, audio: false }])
	session.destroy()
})

test("a refused grant ends in denied with the reason", async () => {
	installRefusal("NotAllowedError")
	const session = new CameraSession()
	await session.start()
	expect(session.phase).toBe("denied")
	expect(session.reason).not.toBe("")
	session.destroy()
})

test("a missing camera ends in unavailable", async () => {
	for (const name of ["NotFoundError", "OverconstrainedError"]) {
		installRefusal(name)
		const session = new CameraSession()
		await session.start()
		expect(session.phase).toBe("unavailable")
		expect(session.reason).not.toBe("")
		session.destroy()
	}
})

test("an unexpected failure ends in failed", async () => {
	installRefusal("AbortError")
	const session = new CameraSession()
	await session.start()
	expect(session.phase).toBe("failed")
	session.destroy()
})

test("no capture backend ends in unavailable", async () => {
	vi.stubGlobal("navigator", {})
	const session = new CameraSession()
	await session.start()
	expect(session.phase).toBe("unavailable")
	session.destroy()
})

test("switchFacing flips the lens and reopens the stream", async () => {
	const { stream } = fakeStream()
	const seen: unknown[] = []
	installGrant(stream, seen)
	const session = new CameraSession()
	session.bind(fakeVideo(640, 480))
	await session.start({ facing: "user" })
	await session.switchFacing()
	expect(session.facing).toBe("environment")
	expect(session.phase).toBe("live")
	expect(seen).toHaveLength(2)
	expect(seen[1]).toEqual({ video: { facingMode: "environment" }, audio: false })
	session.destroy()
})

test("switchFacing while idle only flips the next lens", async () => {
	const session = new CameraSession()
	await session.switchFacing()
	expect(session.facing).toBe("environment")
	expect(session.phase).toBe("idle")
	session.destroy()
})

test("capture throws before the session runs", async () => {
	const session = new CameraSession()
	await expect(session.capture()).rejects.toThrow("not live")
	session.destroy()
})

test("capture draws the frame and stop releases every track", async () => {
	const { stream, tracks } = fakeStream()
	const seen: unknown[] = []
	installGrant(stream, seen)
	const drawn: Array<{ width: number; height: number }> = []
	const canvas = {
		width: 0,
		height: 0,
		getContext: () => ({
			drawImage: (video: { videoWidth: number; videoHeight: number }, x: number, y: number, w: number, h: number) => {
				drawn.push({ width: video.videoWidth, height: video.videoHeight })
				expect(x).toBe(0)
				expect(y).toBe(0)
				expect(w).toBe(640)
				expect(h).toBe(480)
			}
		}),
		toBlob: (done: (blob: Blob | null) => void) => {
			done(new Blob(["frame"], { type: "image/jpeg" }))
		}
	}
	vi.stubGlobal("document", { createElement: () => canvas })
	const session = new CameraSession()
	session.bind(fakeVideo(640, 480))
	await session.start()
	const blob = await session.capture()
	expect(blob.type).toBe("image/jpeg")
	expect(drawn).toEqual([{ width: 640, height: 480 }])
	expect(session.liveTracks).toBe(2)
	session.stop()
	expect(session.phase).toBe("idle")
	expect(session.liveTracks).toBe(0)
	for (const track of tracks) expect(track.readyState).toBe("ended")
	session.destroy()
})

test("a second start while live does nothing", async () => {
	const { stream } = fakeStream()
	const seen: unknown[] = []
	installGrant(stream, seen)
	const session = new CameraSession()
	session.bind(fakeVideo(640, 480))
	await session.start()
	await session.start()
	expect(seen).toHaveLength(1)
	expect(session.phase).toBe("live")
	session.destroy()
})

test("the seam wraps a session, a picker, and a native hook", async () => {
	const { stream } = fakeStream()
	const seen: unknown[] = []
	installGrant(stream, seen)
	const session = new CameraSession()
	session.bind(fakeVideo(2, 2))
	const backed = sessionBackend(session)
	expect(backed.kind).toBe("session")
	await expect(backed.capture()).rejects.toThrow("not live")

	const picked = new File(["picked"], "picked.jpg", { type: "image/jpeg" })
	const files = await fileBackend([picked]).capture()
	expect(files).toBe(picked)
	await expect(fileBackend(null).capture()).rejects.toThrow("No file was picked")

	const native = nativeBackend(async () => new Blob(["native"], { type: "image/jpeg" }))
	expect(native.kind).toBe("native")
	expect((await native.capture()).size).toBeGreaterThan(0)
	session.destroy()
})
