import type { CaptureChunk, CaptureMode, CaptureOptions, CaptureResult, CaptureState } from "./types.js";
/**
 * Records microphone audio through one of two modes. The compressed mode uses
 * MediaRecorder, the PCM mode runs an AudioWorklet, and both share one
 * lifecycle.
 *
 * The microphone opens only inside a gesture, because the browser grants
 * capture from a user action. Nothing here touches a browser global at import
 * time, so the module stays safe to evaluate on a server.
 *
 * A caller may supply the context the PCM mode records on. The recorder
 * disconnects its nodes on stop and reset either way, and it closes only a
 * context it made.
 */
export declare class AudioRecorder {
    #private;
    /** The capture mode this recorder writes with. */
    readonly mode: CaptureMode;
    /** The lifecycle state of the recorder. */
    state: CaptureState;
    /** The seconds left before the take stops itself. */
    countdown: number;
    /** The number of blocks captured so far. */
    chunkCount: number;
    /** The finished take, or null before a stop. */
    result: CaptureResult | null;
    /**
     * The rate blocks arrive at, in hertz. A browser may render at the
     * device rate rather than the rate the take declares.
     */
    get renderRate(): number;
    /** The error behind a denied or failed state, or null. */
    error: unknown;
    constructor(options?: CaptureOptions);
    /** The PCM blocks captured so far, in order. A compressed take holds none. */
    get chunks(): readonly CaptureChunk[];
    /** The span of one block in seconds, the tolerance a duration check allows. */
    get chunkSeconds(): number;
    /** Opens the microphone and starts a take. Call this from a user gesture. */
    start(): Promise<void>;
    /** Ends the take and resolves once the recording is ready or has failed. */
    stop(): Promise<void>;
    /** Drops any take and returns the recorder to idle with no recording. */
    reset(): void;
}
