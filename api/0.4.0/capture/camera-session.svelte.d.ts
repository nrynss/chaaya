/**
 * Which lens a camera session opens. Front by default, rear on request. The
 * app names the lens and the session passes it to the capture backend.
 */
export type CameraFacing = "user" | "environment";
/**
 * The lifecycle of a camera session. A session requests the camera, runs
 * live, and ends in idle when it stops. A refused grant ends in denied, a
 * camera that is missing or unusable ends in unavailable, and any other
 * failure ends in failed. The reason carries the message behind the three
 * unhappy states.
 */
export type CameraPhase = "idle" | "requesting" | "live" | "denied" | "unavailable" | "failed";
/** What `start` needs. */
export interface CameraStartOptions {
    /** Which lens to open. Keeps the current one when omitted. */
    readonly facing?: CameraFacing;
    /** The element the live stream plays on. Keeps the bound one when omitted. */
    readonly video?: HTMLVideoElement | null;
}
/** Options for one still grab. */
export interface CameraCaptureOptions {
    /** The container type. Defaults to image/jpeg. */
    readonly mime?: string;
    /** The encoder quality from zero to one. Defaults to 0.92. */
    readonly quality?: number;
}
/**
 * Opens the camera on a caller supplied video element and grabs stills.
 *
 * The camera opens only inside a gesture, because the browser grants capture
 * from a user action. Nothing here touches a browser global at import time,
 * so the module stays safe to evaluate on a server.
 *
 * The session mirrors nothing. An app may mirror its preview through its own
 * styles, and a grabbed still stays unmirrored either way, because the grab
 * draws the raw frame.
 *
 * The session stops its tracks when the page hides and when the caller stops
 * or destroys it, so the camera light goes off.
 */
export declare class CameraSession {
    #private;
    /** The lifecycle state of the session. */
    phase: CameraPhase;
    /** Which lens the session runs or would open. */
    facing: CameraFacing;
    /** The message behind a denied, unavailable, or failed phase. Empty elsewhere. */
    reason: string;
    /**
     * Bind a video element and the hide handlers. Call after mount, so no
     * server render touches the window. A second bind swaps the element and
     * keeps one pair of listeners. The stream follows on the next start.
     */
    bind(video: HTMLVideoElement): void;
    /** Forget the element and drop the hide handlers. The stream stays until stop. */
    unbind(): void;
    /** Open the camera. Call this from a user gesture. */
    start(options?: CameraStartOptions): Promise<void>;
    /** Flip the lens. Restarts the stream when one runs, else flips the next start. */
    switchFacing(): Promise<void>;
    /**
     * Grab the current frame as a blob. Draws the raw frame, so a mirrored
     * preview still saves unmirrored. Throws when the session is not live or
     * the video carries no frame yet.
     */
    capture(options?: CameraCaptureOptions): Promise<Blob>;
    /** Release every track and return to idle. A second call does nothing. */
    stop(): void;
    /** Stop the stream and drop the hide handlers. Call when the owner leaves. */
    destroy(): void;
    /** How many tracks are still live. A stopped session holds none. */
    get liveTracks(): number;
}
