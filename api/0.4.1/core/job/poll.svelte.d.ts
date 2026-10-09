import type { ChaayaError } from "../error.js";
import type { JobProgress } from "../progress.js";
import type { JobConnection } from "./types.js";
/** What one poller needs. The fetch and the map are the backend. The loop is not. */
export interface JobPollerOptions<T> {
    /** Read the work once. It receives an abort signal and resolves the raw
     * answer. A rejection counts toward the error budget. */
    fetchState: (signal: AbortSignal) => Promise<T>;
    /** Map the raw answer onto a progress reading. A throw counts toward
     * the error budget like a failed read, so an unreadable answer is
     * transient rather than terminal. */
    toProgress: (response: T) => JobProgress;
    /** Whether a mapped reading ends the watch. Core has no terminal enum of its own. */
    isTerminal: (reading: JobProgress) => boolean;
    /** The first interval between reads, in milliseconds. Default 1000. */
    intervalMs?: number;
    /** The ceiling the interval backs off to, in milliseconds. Default 8000. */
    maxIntervalMs?: number;
    /** Consecutive failures the watch survives before it fails. Default 3. */
    errorBudget?: number;
    /** The whole watch fails after this many milliseconds. Omit for no timeout.
     * Time spent paused does not count. */
    timeoutMs?: number;
    /** Stop the watch when this aborts. The watch owns its own abort apart
     * from this, so an in-flight read still cancels on close. */
    signal?: AbortSignal;
    /** Pause while the page is hidden or offline instead of polling a job the
     * page cannot see. The watch reads at once when the page returns.
     * Defaults to true. */
    pauseWhenHidden?: boolean;
    /** Runs after a mapped reading lands. A failed read does not call it. */
    onPoll?: (reading: JobProgress) => void;
}
/** Follow one job by polling and publish a progress reading.
 *
 * The reading has the same shape `JobStream` publishes, so a view cannot
 * tell polling from streaming. Fields merge the same way: a present field
 * overwrites, an absent field stays.
 *
 * The interval backs off while the reading stays unchanged, doubling up to
 * the ceiling, and resets to the base on any change. A failed read keeps
 * the current interval and counts toward the error budget. The budget counts
 * consecutive failures, so one success clears it. The whole watch fails past
 * the timeout. A terminal reading ends the watch and becomes the last change
 * this poller makes.
 *
 * The pause rule matches `FrameLoop` through the same helper. While the page
 * is hidden or offline the poller sends no request and runs no timer. The
 * first visible or online event reads at once. Time spent paused does not
 * count toward the timeout.
 *
 * Construction touches nothing, so importing this module on a server is safe.
 */
export declare class JobPoller<T> {
    #private;
    /** The published reading. Fields stay absent until a poll sets them. */
    progress: JobProgress;
    /** The failure that ended the watch, when it ended in failure. */
    error: ChaayaError | undefined;
    /** Where the watch stands. There is no reconnecting state. A failed read
     * retries on the same interval until the budget runs out. */
    connection: JobConnection;
    constructor(options: JobPollerOptions<T>);
    /** True after close, a terminal reading, or a failure. */
    get stopped(): boolean;
    /** Start polling. Call it once during component initialisation. A test passes its own cleanup runner. */
    attach(registerCleanup?: (task: () => () => void) => void): void;
    /** Stop polling. It cancels the in-flight read and any pending poll. A second call changes nothing. */
    close(): void;
}
