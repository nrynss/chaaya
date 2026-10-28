import type { NamedEvent } from "./frame.js";
import type { StreamConnection } from "./loop.svelte.js";
import type { ReconnectOptions } from "./reconnect.js";
/** Where one event stream stands. Same states as the shared loop. */
export type EventConnection = StreamConnection;
/** What createEventStream needs. Event names are the caller's. Nothing here reads a job frame. */
export interface EventStreamOptions {
    /** Extra headers. Accept is always text/event-stream. Merged over `requestInit` headers. */
    headers?: HeadersInit;
    /** Extra fetch fields. `headers` and `credentials` carry auth. `accept` does not stick. `signal` is ignored. */
    requestInit?: RequestInit;
    /** Event names to keep. Omit to keep every named event. A plain array, so `includes` does not walk the prototype. */
    events?: readonly string[];
    /** Event names that end the stream. The first one closes it.
     * A name that is absent from `events` can never stop the stream: the
     * filter refuses the frame before the terminal check runs. */
    terminal?: readonly string[];
    /** Read events the stream may have missed. It runs once per open connection. */
    catchUp?: () => Promise<readonly NamedEvent[] | void>;
    /** Run for each accepted event. A comment frame never arrives here. It calls `onComment`. */
    onFrame?: (event: NamedEvent) => void;
    /** Run when a comment frame arrives, including a heartbeat. The argument is the comment text, the same string `FrameLoop` passes. */
    onComment?: (comment: string) => void;
    /** Run when a dropped stream opens again. It receives the new count. */
    onReconnect?: (count: number) => void;
    /** The reconnect schedule. Omit for the shared default. */
    reconnect?: ReconnectOptions;
    /** Pause while the page is hidden or offline instead of spending
     * reconnect attempts it cannot use. Defaults to true. */
    pauseWhenHidden?: boolean;
}
/** A live named-event stream. */
export interface EventStream {
    readonly connection: EventConnection;
    readonly reconnects: number;
    readonly events: NamedEvent[];
    readonly lastEventId: number;
    /** Epoch milliseconds of the last comment frame. Undefined until one arrives. */
    readonly lastComment: number | undefined;
    /** Adopt events captured before this view existed. Call it before attach().
     * A terminal event in this list closes the stream before attach(), so
     * attach() then connects nothing. */
    prime(events: readonly NamedEvent[]): void;
    /** Follow the stream. A test passes its own cleanup runner. */
    attach(registerCleanup?: (task: () => () => void) => void): void;
    /** Stop following. A second call changes nothing. */
    close(): void;
}
/** Events captured before the page that renders them exists.
 * This is not a product topic. It is a list of frames. */
export declare class FrameBuffer {
    readonly events: NamedEvent[];
    push(event: NamedEvent): void;
    drain(): NamedEvent[];
}
/**
 * Follow one named-event stream.
 *
 * This is not a job client. It does not read a job id, a stage, or a fixed
 * set of event names. The fetch loop is `FrameLoop` in core. This function
 * only decides which names to keep.
 *
 * Transport: named SSE over `fetch`. This is not `EventSource`. The browser
 * event source hides a refused status and uses its own retry. There is no
 * WebSocket path.
 *
 * Last-Event-ID matches the job stream. The first connect does not send it,
 * even after `prime()`. A reconnect sends it when the cursor is not 0.
 *
 * Dedup assumes strictly climbing ids. A positive id less than or equal to
 * the cursor is a replay and is dropped. An empty `id:` line (`resetId`)
 * clears the cursor, so the next positive id is new. An explicit `id: 0`
 * does the same. A frame with no id line is kept and does not move the
 * cursor. Comment frames update `lastComment` and call `onComment`. They do not call `onFrame`, they are not events, and they do not move the cursor, even when the comment carries an id line.
 *
 * A terminal name that is absent from the `events` filter never arrives, so
 * it cannot stop the stream. `prime()` with a terminal event closes the
 * stream before `attach()`, and `attach()` then connects nothing.
 */
export declare function createEventStream(url: string, options?: EventStreamOptions): EventStream;
