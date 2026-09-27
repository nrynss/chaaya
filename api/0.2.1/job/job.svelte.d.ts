import { type JobEvent } from "../wire/index.js";
import type { JobConnection, JobError, JobStatus, JobStreamOptions } from "./types.js";
export declare class JobStream {
    #private;
    /** The status of the job. It starts queued and stops at the first terminal. */
    status: JobStatus;
    /** The step the job runs, or undefined before the first reading. */
    stage: string | undefined;
    /** The work done so far, or undefined before the first reading. */
    current: number | undefined;
    /** The work the job totals, or undefined before the first reading. */
    total: number | undefined;
    /** The error of a failed job, or undefined while the job lives. */
    error: JobError | undefined;
    /** Where the stream stands. */
    connection: JobConnection;
    /** The count of dropped streams that opened again. */
    reconnects: number;
    /** Every accepted frame in arrival order. A component that mounts after
     * the first frames still reads them here. */
    events: JobEvent[];
    constructor(options: JobStreamOptions);
    /** Follow the job. Call it once during component initialisation. The
     * stream opens before the first render, and it closes when that component
     * is destroyed. A test passes its own cleanup runner, because only a
     * component owns the effect context the default runner needs. */
    attach(registerCleanup?: (task: () => () => void) => void): void;
    /** Stop following the job. It cancels the stream and any pending
     * reconnect. A second call changes nothing. */
    close(): void;
}
