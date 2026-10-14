import type { CaptureResult } from "../capture/types.js";
import { type RecordingPhase } from "./phase.js";
/** Why a session command was refused before it changed the phase. */
export type RecordingSessionCode = "illegal" | "busy" | "pause_unsupported" | "empty_take";
/**
 * A command the current phase does not allow, a second start while the first
 * is still opening the microphone, a pause the capture port does not offer,
 * or a stop that produced no bytes.
 */
export declare class RecordingSessionError extends Error {
    readonly code: RecordingSessionCode;
    readonly phase: RecordingPhase;
    constructor(code: RecordingSessionCode, phase: RecordingPhase, message: string);
}
/** `stop`, `start`, or `reset` lost the race to `cancel` or `reset`. The
 * phase is already the winner's phase. This is not a capture failure. */
export declare class RecordingCancelled extends Error {
    readonly code = "cancelled";
    constructor();
}
/**
 * The microphone port a session drives. `AudioRecorder` satisfies it through
 * `captureFromRecorder`. A port that can pause implements `pause` and
 * `resume`. A port that omits them cannot be paused, and the session says so
 * instead of pretending the take held still.
 */
export interface RecordingCapture {
    /** Open the microphone and start a take. Throw when the grant fails hard.
     * A grant that resolves without throwing must still report `running`. */
    start(): Promise<void>;
    /** True when a take is on and `stop` will finish it. */
    running(): boolean;
    /** End the take and resolve once `take` can be read. */
    stop(): Promise<void>;
    /** Hold the take without ending it. Omit when the port cannot pause. */
    pause?(): void | Promise<void>;
    /** Continue a held take. Required when `pause` is present. */
    resume?(): void | Promise<void>;
    /** Drop the device and any buffered take. */
    reset(): void;
    /** The finished bytes, or null when the port kept nothing. */
    take(): CaptureResult | null;
    /** The capture failure behind a start that resolved but is not running. */
    captureError(): unknown;
}
/**
 * Where a finished take goes. The session does not know the URL, the method,
 * or the envelope. Honour `signal`: a cancel aborts it, and a late resolve
 * after the abort is ignored.
 */
export interface RecordingUpload {
    send(result: CaptureResult, signal: AbortSignal): Promise<void>;
}
/** What `createRecordingSession` needs. */
export interface RecordingSessionOptions {
    readonly capture: RecordingCapture;
    readonly upload: RecordingUpload;
}
/** A headless take. Subscribe to paint. The methods are the only moves. */
export interface RecordingSession {
    readonly phase: RecordingPhase;
    /** The last start or upload failure, or null. A cancel clears it. */
    readonly error: unknown;
    /** The bytes handed to upload, or null before that, after cancel, and
     * after reset. A failed upload keeps them so the caller can retry. */
    readonly result: CaptureResult | null;
    /** Open the microphone. Resolves once the phase is `recording`. */
    start(): Promise<void>;
    /** Hold a running take. Rejects when the capture port cannot pause. */
    pause(): Promise<void>;
    /** Continue a held take. */
    resume(): Promise<void>;
    /** End the take and upload it. Resolves once the phase is `done`. */
    stop(): Promise<void>;
    /** Drop a running, paused, uploading, or still-opening take. */
    cancel(): void;
    /** Return to `idle` from any phase, including a finished one. */
    reset(): void;
    /** Hear phase, error, and result changes. The listener must not start
     * another command on this session. */
    subscribe(listener: (phase: RecordingPhase) => void): () => void;
}
/**
 * Drive one take from idle through upload.
 *
 * The phase stays `idle` while `start` waits on the microphone. A second
 * start in that window throws `busy`. Cancel in that window lands on
 * `cancelled` even though the public table has no cancel from `idle`: the
 * table describes a phase that has already been entered, and the grant has
 * not entered `recording` yet.
 *
 * `AudioRecorder` has no pause. `captureFromRecorder` therefore omits
 * `pause` and `resume`, and `pause` throws `pause_unsupported` while the
 * phase stays `recording`. A port that can hold a take implements both.
 *
 * Nothing here touches a browser global. The capture port does that, if
 * anything does.
 */
export declare function createRecordingSession(options: RecordingSessionOptions): RecordingSession;
