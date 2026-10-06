import type { CameraSession } from "./camera-session.svelte.js"

/**
 * One still image backend. A live session, a file picker, and a native camera
 * all satisfy this shape, so the app switches backends without changing its
 * flow. The prepared blob enters the one-shot upload path unchanged.
 */
export interface ImageCaptureBackend {
	/** A short label for logs. Names the kind, never a vendor. */
	readonly kind: string
	/** Produce one still image. */
	capture(): Promise<Blob>
	/** Release the backend. Omit when there is nothing to release. */
	stop?(): void
}

/** Wrap a live session as a backend. */
export function sessionBackend(session: CameraSession): ImageCaptureBackend {
	return {
		kind: "session",
		capture: () => session.capture(),
		stop: () => session.stop()
	}
}

/** Wrap picked files as a backend. Takes the first image file. */
export function fileBackend(files: FileList | File[] | null | undefined): ImageCaptureBackend {
	return {
		kind: "file",
		capture: async () => {
			const list: ArrayLike<File> | undefined = files ?? undefined
			const first = list?.[0]
			if (!first) throw new Error("No file was picked, so there is nothing to capture.")
			return first
		}
	}
}

/** Wrap a native camera hook as a backend. The hook owns permissions. */
export function nativeBackend(capture: () => Promise<Blob>): ImageCaptureBackend {
	return { kind: "native", capture }
}
