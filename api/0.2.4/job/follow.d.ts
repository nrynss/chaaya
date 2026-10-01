import type { ErrorEvent, ProgressEvent, StatusEvent } from "../wire/index.js";
import type { JobStatus } from "./types.js";
/** One event that reports on a job. A heartbeat carries no job state, so it
 * never reaches this module. */
export type JobReport = ProgressEvent | StatusEvent | ErrorEvent;
/** Whether a status ends the job. */
export declare function isTerminalStatus(status: JobStatus): boolean;
/** A blank line of either ending closes a frame. takeFrames pulls every whole
 * frame out of a decode buffer and leaves the unterminated tail behind. A run
 * of blank lines adds no frame. */
export declare function takeFrames(buffer: string): {
    frames: string[];
    rest: string;
};
/** The ordering rules one job stream obeys.
 *
 * The stream carries frames for one job, and their ids climb. A repeat of an
 * id this follower already read is a duplicate, so it never lands twice. A
 * frame for another job belongs to another stream, so it is refused. The
 * first terminal event ends the job, and every event after it is refused.
 */
export declare class JobFollower {
    #private;
    /** The id of the last frame this follower accepted. Zero before the
     * first frame that carried one. */
    get lastEventId(): number;
    /** The job this follower accepted, or undefined before its first frame. */
    get jobId(): string | undefined;
    /** Whether a terminal event has already been accepted. */
    get ended(): boolean;
    /** Accept one event, or refuse it as a repeat. A frame with an id this
     * follower already read, a frame for another job, and a frame after the
     * terminal all come back false. */
    accept(event: JobReport): boolean;
}
