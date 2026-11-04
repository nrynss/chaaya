import { Notifier } from "../../../core/observable.js";
import type { JobEvent } from "../wire/index.js";
import type { JobConnection, JobError, JobStatus, JobStreamOptions } from "./types.js";
/** Follow one Keel job to its end over that job's event feed.
 *
 * The read loop, the reconnect schedule, and the catch-up freshness rule live
 * in the core stream. This class supplies Keel's frame map and the follower
 * that drops duplicates and frames for another job. A snapshot becomes a
 * catch-up: progress in `reading`, and the snapshot error beside it. The
 * fields below are the ones a Keel view already reads.
 *
 * Construction touches nothing, so importing this module on a server is safe.
 * attach() opens the stream and returns its teardown. A Svelte component
 * passes the stream to `attach` from `@nrynss/chaaya/svelte`.
 *
 * The stream is an observable. It re-notifies each change of the core
 * stream it wraps, so a view sees one observable and one notify per kept
 * frame. The Keel event list changes inside that same frame.
 */
export declare class JobStream extends Notifier {
    #private;
    constructor(options: JobStreamOptions);
    /** The status of the job. It starts queued and stops at the first terminal. */
    get status(): JobStatus;
    /** The step the job runs, or undefined before the first reading. */
    get stage(): string | undefined;
    /** The work done so far, or undefined before the first reading. */
    get current(): number | undefined;
    /** The work the job totals, or undefined before the first reading. */
    get total(): number | undefined;
    /** The error of a failed job, or undefined while the job lives. */
    get error(): JobError | undefined;
    /** Where the stream stands. */
    get connection(): JobConnection;
    /** The count of dropped streams that opened again. */
    get reconnects(): number;
    /** Every frame the core stream kept, in arrival order, as Keel events.
     * Ignored and refused frames are not here. A component that mounts after
     * the first frames still reads them here. Core `frames` is the same accept
     * set as raw named events. Keel views read this list. It is replaced,
     * never mutated, so the same reference holds between notifications. */
    get events(): readonly JobEvent[];
    /** Follow the job. It returns the teardown, which closes the stream. */
    attach(): () => void;
    /** Stop following the job. It cancels the stream and any pending reconnect. A second call changes nothing. */
    close(): void;
}
