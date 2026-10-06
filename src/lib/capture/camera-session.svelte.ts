/**
 * Which lens a camera session opens. Front by default, rear on request. The
 * app names the lens and the session passes it to the capture backend.
 */
export type CameraFacing = "user" | "environment"

/**
 * The lifecycle of a camera session. A session requests the camera, runs
 * live, and ends in idle when it stops. A refused grant ends in denied, a
 * camera that is missing or unusable ends in unavailable, and any other
 * failure ends in failed. The reason carries the message behind the three
 * unhappy states.
 */
export type CameraPhase = "idle" | "requesting" | "live" | "denied" | "unavailable" | "failed"

/** What `start` needs. */
export interface CameraStartOptions {
	/** Which lens to open. Keeps the current one when omitted. */
	readonly facing?: CameraFacing
	/** The element the live stream plays on. Keeps the bound one when omitted. */
	readonly video?: HTMLVideoElement | null
}

/** Options for one still grab. */
export interface CameraCaptureOptions {
	/** The container type. Defaults to image/jpeg. */
	readonly mime?: string
	/** The encoder quality from zero to one. Defaults to 0.92. */
	readonly quality?: number
}

function isDenial(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		((error as { name?: unknown }).name === "NotAllowedError" ||
			(error as { name?: unknown }).name === "SecurityError")
	)
}

function isMissing(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false
	const name = (error as { name?: unknown }).name
	return name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError"
}

function messageOf(error: unknown): string {
	return error instanceof Error && error.message !== "" ? error.message : String(error)
}

/**
 * Opens the camera on a caller supplied video element and grabs stills.
 *
 * The camera opens only inside a gesture, because the browser grants capture
 * from a user action. Nothing here touches a browser global at import time,
 * so the module stays safe to evaluate on a server.
 *
 * The session mirrors nothing. An app may mirror its preview through its own
 * styles, and a grabbed still stays unmirrored either way, because the grab
 * draws the raw frame.
 *
 * The session stops its tracks when the page hides and when the caller stops
 * or destroys it, so the camera light goes off.
 */
export class CameraSession {
	/** The lifecycle state of the session. */
	phase = $state<CameraPhase>("idle")
	/** Which lens the session runs or would open. */
	facing = $state<CameraFacing>("user")
	/** The message behind a denied, unavailable, or failed phase. Empty elsewhere. */
	reason = $state("")

	#stream: MediaStream | null = null
	#video: HTMLVideoElement | null = null
	#session = 0
	#onHide: (() => void) | null = null
	#onVis: (() => void) | null = null

	/**
	 * Bind a video element and the hide handlers. Call after mount, so no
	 * server render touches the window. A second bind swaps the element and
	 * keeps one pair of listeners. The stream follows on the next start.
	 */
	bind(video: HTMLVideoElement): void {
		this.#video = video
		if (this.#onHide !== null) return
		const onHide = () => this.stop()
		const onVis = () => {
			const state = (globalThis as unknown as { document?: Document }).document?.visibilityState
			if (state === "hidden") this.stop()
		}
		this.#onHide = onHide
		this.#onVis = onVis
		const scope = globalThis as unknown as { window?: Window; document?: Document }
		if (typeof scope.window?.addEventListener === "function") {
			scope.window.addEventListener("pagehide", onHide)
		}
		if (typeof scope.document?.addEventListener === "function") {
			scope.document.addEventListener("visibilitychange", onVis)
		}
	}

	/** Forget the element and drop the hide handlers. The stream stays until stop. */
	unbind(): void {
		this.#video = null
		const scope = globalThis as unknown as { window?: Window; document?: Document }
		if (this.#onHide !== null) {
			if (typeof scope.window?.removeEventListener === "function") {
				scope.window.removeEventListener("pagehide", this.#onHide)
			}
			this.#onHide = null
		}
		if (this.#onVis !== null) {
			if (typeof scope.document?.removeEventListener === "function") {
				scope.document.removeEventListener("visibilitychange", this.#onVis)
			}
			this.#onVis = null
		}
	}

	/** Open the camera. Call this from a user gesture. */
	async start(options: CameraStartOptions = {}): Promise<void> {
		if (this.phase === "requesting" || this.phase === "live") return
		if (options.video !== undefined && options.video !== null) this.bind(options.video)
		if (options.facing !== undefined) this.facing = options.facing
		this.#session += 1
		const session = this.#session
		this.phase = "requesting"
		this.reason = ""
		try {
			const stream = await this.#openCamera(this.facing)
			if (session !== this.#session) {
				for (const track of stream.getTracks()) track.stop()
				return
			}
			this.#stream = stream
			await this.#play(stream)
			if (session !== this.#session || this.phase !== "requesting") {
				for (const track of stream.getTracks()) track.stop()
				return
			}
			this.phase = "live"
		} catch (error) {
			if (session !== this.#session || this.phase !== "requesting") return
			this.#release()
			this.reason = messageOf(error)
			this.phase = isDenial(error) ? "denied" : isMissing(error) ? "unavailable" : "failed"
		}
	}

	/** Flip the lens. Restarts the stream when one runs, else flips the next start. */
	async switchFacing(): Promise<void> {
		const next: CameraFacing = this.facing === "user" ? "environment" : "user"
		if (this.phase !== "live" && this.phase !== "requesting") {
			this.facing = next
			return
		}
		this.facing = next
		this.#session += 1
		const session = this.#session
		const video = this.#video
		this.#release()
		this.phase = "requesting"
		this.reason = ""
		try {
			const stream = await this.#openCamera(next)
			if (session !== this.#session) {
				for (const track of stream.getTracks()) track.stop()
				return
			}
			this.#stream = stream
			if (video !== null) {
				video.srcObject = stream
				await video.play().catch(() => undefined)
			}
			if (session !== this.#session || this.phase !== "requesting") {
				for (const track of stream.getTracks()) track.stop()
				return
			}
			this.phase = "live"
		} catch (error) {
			if (session !== this.#session || this.phase !== "requesting") return
			this.#release()
			this.reason = messageOf(error)
			this.phase = isDenial(error) ? "denied" : isMissing(error) ? "unavailable" : "failed"
		}
	}

	/**
	 * Grab the current frame as a blob. Draws the raw frame, so a mirrored
	 * preview still saves unmirrored. Throws when the session is not live or
	 * the video carries no frame yet.
	 */
	async capture(options: CameraCaptureOptions = {}): Promise<Blob> {
		const video = this.#video
		if (this.phase !== "live" || this.#stream === null) {
			throw new Error("The camera is not live, so there is no frame to grab.")
		}
		const width = video?.videoWidth ?? 0
		const height = video?.videoHeight ?? 0
		if (!video || width <= 0 || height <= 0) {
			throw new Error("The video carries no frame yet, so there is nothing to grab.")
		}
		const mime = options.mime ?? "image/jpeg"
		const quality = options.quality ?? 0.92
		const scope = globalThis as unknown as { document?: Document }
		const canvas = scope.document?.createElement("canvas")
		if (!canvas) throw new Error("This runtime offers no canvas, so the frame cannot be grabbed.")
		canvas.width = width
		canvas.height = height
		const context = canvas.getContext("2d")
		if (!context) throw new Error("This browser cannot draw the frame.")
		context.drawImage(video, 0, 0, width, height)
		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob((done) => resolve(done), mime, quality)
		})
		if (!blob) throw new Error("This browser cannot encode the frame.")
		return blob
	}

	/** Release every track and return to idle. A second call does nothing. */
	stop(): void {
		this.#session += 1
		this.#release()
		if (this.phase !== "idle") this.phase = "idle"
		this.reason = ""
	}

	/** Stop the stream and drop the hide handlers. Call when the owner leaves. */
	destroy(): void {
		this.stop()
		this.unbind()
	}

	/** How many tracks are still live. A stopped session holds none. */
	get liveTracks(): number {
		const stream = this.#stream
		if (!stream) return 0
		return stream.getTracks().filter((track) => track.readyState === "live").length
	}

	async #openCamera(facing: CameraFacing): Promise<MediaStream> {
		const media = globalThis.navigator?.mediaDevices
		if (!media?.getUserMedia) {
			throw new DOMException("This browser cannot reach a camera.", "NotFoundError")
		}
		return media.getUserMedia({ video: { facingMode: facing }, audio: false })
	}

	async #play(stream: MediaStream): Promise<void> {
		const video = this.#video
		if (!video) return
		video.srcObject = stream
		video.playsInline = true
		await video.play().catch(() => undefined)
	}

	#release(): void {
		if (this.#stream) {
			for (const track of this.#stream.getTracks()) track.stop()
		}
		this.#stream = null
		if (this.#video) {
			try {
				this.#video.pause()
			} catch {
				// A video with no stream has nothing to pause.
			}
			this.#video.srcObject = null
		}
	}
}
