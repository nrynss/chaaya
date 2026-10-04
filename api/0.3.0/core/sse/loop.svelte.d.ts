import type { EventFrame, NamedEvent } from "./frame.js";
import type { ReconnectOptions } from "./reconnect.js";
/** Where one stream stands. Connecting covers the first attempt, live covers
 * an open stream, reconnecting covers a retry, failed covers a stream that
 * gave up, and closed covers a watch that ended. */
export type StreamConnection = "connecting" | "live" | "reconnecting" | "failed" | "closed";
/** What the caller does with one parsed frame.
 *
 * `keep` means the frame belongs to the caller's model. Last-Event-ID moves
 * only for a kept frame that carried an id line (`idSet` or `resetId`).
 * Set `takeId` to move that id without keeping the frame, or to keep a frame
 * without moving it. Omit `takeId` and it follows `keep`.
 * `stop` ends the watch after the id is applied. */
export interface FrameDecision {
    keep: boolean;
    takeId?: boolean;
    stop?: boolean;
}
/** What the shared follow loop needs. The caller decides what a frame means. */
export interface FrameLoopOptions {
    /** The event stream to follow. */
    url: string;
    /** Extra fetch fields. `accept` is always `text/event-stream`. `signal` is
     * ignored. The loop owns the abort. */
    requestInit?: RequestInit;
    /** The reconnect schedule. Omit for the shared default. */
    reconnect?: ReconnectOptions;
    /** One event frame (`kind: "event"`). Comment frames never arrive here.
     * They set `lastComment` and call `onComment`, and there is nothing to
     * return for them. A thrown error is a dropped frame, not a dropped stream. */
    onFrame: (frame: EventFrame) => FrameDecision;
    /** A comment arrived. The argument is the comment text, the same string
     * `createEventStream` passes to its `onComment`. `lastComment` is already
     * the timestamp. The loop does not call `onFrame`, and an `id:` on the
     * comment does not move the cursor. A thrown error is a dropped frame,
     * not a dropped stream. */
    onComment?: (comment: string) => void;
    /** Once the connection is live. A throw leaves the stream alone. Call `close()` to end the watch. */
    catchUp?: () => Promise<void>;
    /** Runs when a dropped stream opens again. It receives the new count. */
    onReconnect?: (count: number) => void;
}
/**
 * Ids are assumed to strictly climb.
 *
 * A replay is a positive id that is less than or equal to the cursor. An
 * empty id line (`resetId`) sets the cursor to 0 and is not a replay. An
 * explicit `id: 0` does the same. A frame with no id line is not compared
 * and does not move the cursor.
 *
 * A caller-built event (catch-up, prime) often omits the flags. A positive
 * id on that event counts as an id line. Zero without flags does not.
 */
export declare function isReplayId(cursor: number, event: Pick<NamedEvent, "id" | "idSet" | "resetId">): boolean;
/** The cursor after a kept frame. A replay still returns the old cursor. The caller should have dropped it. */
export declare function nextEventId(cursor: number, event: Pick<NamedEvent, "id" | "idSet" | "resetId">): number;
/**
 * Follow one server-sent stream over fetch.
 *
 * This is the only read loop. `JobStream` projects frames onto a progress
 * reading. `createEventStream` projects them onto a list of named events.
 * Neither copies connect, read, or reconnect.
 *
 * The transport is fetch, not `EventSource`, because fetch reports a refused
 * status and this loop bounds its own delay. There is no WebSocket path.
 * Construction touches nothing, so importing this module on a server is safe.
 */
export declare class FrameLoop {
    #private;
    connection: StreamConnection;
    reconnects: number;
    /** Id of the last kept frame that carried an id line. Zero means none yet, an explicit zero, or an empty id line. */
    lastEventId: number;
    /** Epoch milliseconds of the last comment frame. Undefined until one arrives. */
    lastComment: number | undefined;
    constructor(options: FrameLoopOptions);
    /** True after close() or a terminal decision. */
    get stopped(): boolean;
    /** Move the cursor the way a kept frame would. Used by prime() and catch-up, which are not wire frames. */
    noteId(event: Pick<NamedEvent, "id" | "idSet" | "resetId">): void;
    /** Follow the stream. Call it once during component initialisation. A test passes its own cleanup runner. */
    attach(registerCleanup?: (task: () => () => void) => void): void;
    /** Stop following. It cancels the stream and any pending reconnect. A second call changes nothing. */
    close(): void;
}
