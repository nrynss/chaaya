import { formatNamedFrame, type NamedFrameFields } from "../core/sse/frame.js"

/** One frame as fields, or already-formatted SSE text from `formatNamedFrame`. */
export type SseFrameInput = NamedFrameFields | string

/** Options for a `text/event-stream` response. */
export interface JobStreamResponseOptions {
	/** Extra response headers. `content-type` is always `text/event-stream`. */
	headers?: HeadersInit
	/** Stop writing when this aborts. Pass `request.signal` from the `+server.ts` request handler. */
	signal?: AbortSignal
}

function isAsyncIterable(value: object): value is AsyncIterable<SseFrameInput> {
	return Symbol.asyncIterator in value
}

function frameText(frame: SseFrameInput): string {
	return typeof frame === "string" ? frame : formatNamedFrame(frame)
}

/**
 * Build a `text/event-stream` `Response` a `JobStream` (or `createEventStream`) can follow.
 * Frames are `NamedFrameFields`, or strings already written by `formatNamedFrame`.
 * No Keel event names. No UI. This module does not import `@sveltejs/kit`; a
 * SvelteKit `+server.ts` returns the `Response` as-is.
 *
 * A client cancel stops further writes even when `signal` is omitted. The
 * iterable itself pauses only at its next frame unless it watches that signal.
 */
export function createJobStreamResponse(
	frames: AsyncIterable<SseFrameInput> | Iterable<SseFrameInput>,
	options: JobStreamResponseOptions = {},
): Response {
	const encoder = new TextEncoder()
	const signal = options.signal
	let stopped = false
	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			const stop = (): void => {
				if (stopped) return
				stopped = true
				try {
					controller.close()
				} catch {
					/* already closed by cancel */
				}
			}
			if (signal?.aborted || stopped) {
				stop()
				return
			}
			const onAbort = () => stop()
			signal?.addEventListener("abort", onAbort, { once: true })
			try {
				const write = (chunk: string): boolean => {
					if (signal?.aborted || stopped) return false
					controller.enqueue(encoder.encode(chunk))
					return true
				}
				if (isAsyncIterable(frames as object)) {
					for await (const frame of frames as AsyncIterable<SseFrameInput>) {
						if (!write(frameText(frame))) break
					}
				} else {
					for (const frame of frames as Iterable<SseFrameInput>) {
						if (!write(frameText(frame))) break
					}
				}
				stop()
			} catch (cause) {
				if (stopped) return
				stopped = true
				controller.error(cause)
			} finally {
				signal?.removeEventListener("abort", onAbort)
			}
		},
		cancel() {
			stopped = true
		},
	})

	const headers = new Headers(options.headers)
	headers.set("content-type", "text/event-stream")
	if (!headers.has("cache-control")) headers.set("cache-control", "no-cache")
	return new Response(body, { headers })
}
