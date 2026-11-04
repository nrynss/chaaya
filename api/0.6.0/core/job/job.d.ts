import type { ChaayaError } from "../error.js";
import { Notifier } from "../observable.js";
import type { JobProgress } from "../progress.js";
import type { NamedEvent } from "../sse/frame.js";
import type { JobConnection, JobStreamOptions } from "./types.js";
/** Copy defined fields onto the published reading. An omitted field stays. */
export declare function mergeProgress(base: JobProgress, reading: JobProgress): JobProgress;
/** Follow one event stream and publish a progress reading.
 *
 * The read loop is `FrameLoop`. This class only maps a frame onto a progress
 * reading. Fetch, `Last-Event-ID`, reconnect, and abort are not copied here.
 *
 * The stream reads with fetch and not with EventSource. Fetch reports the
 * status of a refused stream, and the loop bounds its own reconnect delay
 * instead of taking the browser's schedule. There is no WebSocket path.
 *
 * Construction touches nothing, so importing this module on a server is safe.
 * attach() opens the stream and returns the teardown. The stream holds its
 * own state, so any frame that arrives before a view reads it still lands
 * in the published state. A Svelte component passes the stream to `attach`
 * from `@nrynss/chaaya/svelte`, which opens it once the component mounts.
 *
 * Each connection waits for the stream to open, then reads state to catch up
 * when `fetchState` is set, then applies frames as they arrive. A refused
 * stream fails at once, because a status is an answer. A stream that opened
 * and then dropped reconnects with a bounded delay. A stream that never
 * opened fails instead, because a first failure usually repeats. A terminal
 * action ends the watch and becomes the last change this stream makes.
 *
 * `frameMap` decides what each event name means. It is a plain object's own
 * keys. `Object.hasOwn` ignores inherited names such as `toString`. A name
 * that is missing, a handler that is not a function, and a result that is not
 * `ignore`, `progress`, or `terminal` are all ignored. They do not end the
 * watch. `shouldAccept` can refuse a frame before the map runs.
 *
 * Comment frames never reach `onFrame` or `frameMap`, and do not move
 * Last-Event-ID, even when a comment carries an id line. The loop records
 * them on `lastComment` for a view that wants a heartbeat.
 *
 * The stream is an observable. It notifies once per kept frame, once per
 * catch-up that lands, and once per change the loop reports (connection,
 * reconnects, comments). A kept frame that ends the watch still notifies
 * once.
 */
export declare class JobStream extends Notifier {
    #private;
    constructor(options: JobStreamOptions);
    /** The published reading. Fields stay absent until a frame or a catch-up
     * sets them. A change replaces the object. */
    get progress(): JobProgress;
    /** The failure of a terminal action, when that action carried one. */
    get error(): ChaayaError | undefined;
    /** Accepted frames that changed the reading, in arrival order. The list is
     * replaced, never mutated, so the same reference holds between
     * notifications. */
    get frames(): readonly NamedEvent[];
    /** Where the stream stands. */
    get connection(): JobConnection;
    /** The count of dropped streams that opened again. */
    get reconnects(): number;
    /** Epoch milliseconds of the last comment frame. Undefined until one arrives. */
    get lastComment(): number | undefined;
    /** Follow the stream. It returns the teardown, which closes the stream.
     * A Svelte component passes the stream to `attach` from
     * `@nrynss/chaaya/svelte`, which opens it with the component and closes
     * it when that component is destroyed. */
    attach(): () => void;
    /** Stop following. It cancels the stream and any pending reconnect. A second call changes nothing. */
    close(): void;
}
