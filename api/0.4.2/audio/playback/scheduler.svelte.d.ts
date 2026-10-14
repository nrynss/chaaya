import { type TimedClip } from "./clips.js";
/** The knobs a caller sets on a clip scheduler. */
export interface ClipSchedulerOptions {
    /** The context the scheduler places sources on. The scheduler never
     * closes it. */
    readonly context: AudioContext;
    /** The element whose clock the scheduler follows. The caller owns it. */
    readonly element: HTMLMediaElement;
    /** Where clip audio goes. Defaults to the context destination. A test
     * points it at a tap node and keeps the samples it sounds. */
    readonly destination?: AudioNode;
    /** How far the element clock may drift from the planned clock, in
     * seconds, before a reschedule. Defaults to 0.25. */
    readonly tolerance?: number;
    /** How many decoded buffers the cache keeps. Defaults to 8. */
    readonly cacheSize?: number;
    /** Where a failed load reports its key and the browser words. */
    readonly onSkipped?: (key: string, reason: string) => void;
}
/**
 * Timed audio clips previewed against a media element clock. Clips decode
 * once per key into a bounded cache. A play or seek stops every live
 * source. It plans the clips that still have sound at the playhead. An
 * overlapping clip starts now at the right in point, and a later clip waits
 * for its offset. A timeupdate past the drift tolerance reschedules the
 * same way. A clip that fails to load reports through the skipped callback
 * and lands in the skipped set, and nothing replaces it.
 *
 * This preview is an approximation. The server mix measures the release.
 * Importing this module does no DOM work. A caller builds the scheduler on
 * a context a gesture owns, then attaches it to the element it owns.
 */
export declare class ClipScheduler {
    #private;
    /** The clips the next sync plans, in caller order. */
    clips: TimedClip[];
    /** The keys that failed to load, in failure order. */
    skipped: string[];
    constructor(options: ClipSchedulerOptions);
    /** Replace the clip list. The next sync plans the new list. */
    setClips(clips: readonly TimedClip[]): void;
    /** Decode every clip into the cache without sounding anything. A caller
     * warms the cache inside the gesture before play, so the first sync
     * starts at once instead of after a fetch. */
    prepare(): Promise<void>;
    /** Listen to the element. Play and seek reschedule, pause stops every
     * source, and a timeupdate past the tolerance reschedules. */
    attach(): void;
    /** Drop the element listeners. Live sources keep sounding, so stop them
     * first when silence matters. */
    detach(): void;
    /** Stop every live source and plan the clips at the playhead. */
    sync(): Promise<void>;
    /** Stop every live source. The schedule keeps its clips, so the next
     * sync plans them again. */
    stopAll(): void;
    /** How many live sources play now. A test reads it without listening. */
    get liveCount(): number;
}
