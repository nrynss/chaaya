/**
 * Keel's wire shapes. One error envelope covers every failed request, and one
 * event frame covers every step of a job stream. A client branches on the
 * stable names here and never on message wording. These shapes belong to the
 * Keel adapter. They were checked against Keel v0.4.0. Generic modules do not
 * import this file.
 *
 * Every parser returns a typed value or a typed failure. A malformed frame
 * never throws, because one bad frame must cost a progress reading and never
 * the screen.
 */
import { type ParseResult } from "../../../core/result.js";
import { type NamedEvent } from "../../../core/sse/frame.js";
export type { ParseFailure, ParseResult } from "../../../core/result.js";
/** The body every non-2xx JSON response carries under its error member. */
export interface ErrorBody {
    /** The stable snake_case identifier a client branches on. */
    code: string;
    /** A human sentence a client may show but never branch on. */
    message: string;
    /** Optional detail the app alone reads. */
    detail?: unknown;
}
/** The envelope every non-2xx JSON response carries. */
export interface ErrorEnvelope {
    error: ErrorBody;
}
/** Parse the error envelope of a failed request. */
export declare function parseErrorEnvelope(text: string): ParseResult<ErrorEnvelope>;
/** The payload of a progress event. Progress reports work in flight and is
 * never terminal. */
export interface ProgressEvent {
    /** The frame id. Zero when the frame carries no id. */
    id: number;
    /** The event name from the frame's event line. */
    name: "progress";
    /** The job the frame reports on. */
    jobId: string;
    /** The step the job is running. */
    stage: string;
    /** The work done so far. Absent when the producer omits it. */
    current?: number;
    /** The work the job totals. Absent when the producer omits it. */
    total?: number;
    /** Payload the app alone reads. Absent when the producer omits it. */
    detail?: unknown;
}
/** The payload of a terminal status event. The payload status repeats the
 * event name, and the parser rejects a frame where the two disagree. */
export interface StatusEvent {
    /** The frame id. Zero when the frame carries no id. */
    id: number;
    /** The event name from the frame's event line. */
    name: "done" | "cancelled" | "interrupted";
    /** The job the frame reports on. */
    jobId: string;
    /** The terminal status, equal to the event name. */
    status: "done" | "cancelled" | "interrupted";
}
/** The payload of an error event. The error member is the same envelope a
 * failed request carries, so a reader feeds both to one parser. */
export interface ErrorEvent {
    /** The frame id. Zero when the frame carries no id. */
    id: number;
    /** The event name from the frame's event line. */
    name: "error";
    /** The job the frame reports on. */
    jobId: string;
    /** The terminal status, always error. */
    status: "error";
    /** The envelope body a failed request also carries. */
    error: ErrorEnvelope;
}
/** The heartbeat a stream sends after a quiet period. A client ignores it. */
export interface HeartbeatEvent {
    /** The frame id. Zero when the frame carries no id. */
    id: number;
    /** The event name, always heartbeat. */
    name: "heartbeat";
    /** The comment text the frame carried. */
    comment: string;
}
/** Every frame a job stream can carry. */
export type JobEvent = ProgressEvent | StatusEvent | ErrorEvent | HeartbeatEvent;
/** A job event that is not a heartbeat. Comment frames never take this path. */
type JobDataEvent = ProgressEvent | StatusEvent | ErrorEvent;
/** Parse one named event the frame reader already split. This does not accept
 * comments. The JSON, `job_id`, and name rules match `parseJobEvent`. */
export declare function parseJobEventFromNamed(frame: NamedEvent): ParseResult<JobDataEvent>;
/** Parse one job event frame. It returns the typed event or a typed failure
 * and never throws, so a bad frame costs a progress reading and never the
 * screen. Field splitting is the shared frame reader. A comment frame is a
 * heartbeat. An event frame uses the same payload rules as
 * `parseJobEventFromNamed`. */
export declare function parseJobEvent(text: string): ParseResult<JobEvent>;
