import { type NamedFrameFields } from "../core/sse/frame.js";
/** One frame as fields, or already-formatted SSE text from `formatNamedFrame`. */
export type SseFrameInput = NamedFrameFields | string;
/** Options for a `text/event-stream` response. */
export interface JobStreamResponseOptions {
    /** Extra response headers. `content-type` is always `text/event-stream`. */
    headers?: HeadersInit;
    /** Stop writing when this aborts. Pass `request.signal` from the `+server.ts` request handler. */
    signal?: AbortSignal;
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
export declare function createJobStreamResponse(frames: AsyncIterable<SseFrameInput> | Iterable<SseFrameInput>, options?: JobStreamResponseOptions): Response;
