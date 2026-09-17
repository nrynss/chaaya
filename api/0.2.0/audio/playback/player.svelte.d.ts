/** The two ways playback fails. A network failure means the bytes never
 * arrived. A decode failure means they arrived and the browser could not read
 * them. */
export type PlaybackFailure = "network" | "decode";
/** One buffered span of the source, in seconds from its start. */
export interface BufferedSpan {
    readonly start: number;
    readonly end: number;
}
/** A playback failure, carrying its class and the browser's own words. */
export interface PlaybackError {
    readonly failure: PlaybackFailure;
    readonly message: string;
}
/** One audio element per app, unlocked by the first gesture and reused for
 * every clip. A browser blocks playback that no gesture started, so the first
 * user gesture primes the element with a silent clip. Every later clip reuses
 * that element, which keeps the unlocked state alive. */
export declare class AudioPlayer {
    #private;
    /** True while the element is playing. */
    playing: boolean;
    /** The element's position, in seconds. */
    currentTime: number;
    /** The element's length, in seconds. */
    duration: number;
    /** The buffered spans of the element. */
    buffered: BufferedSpan[];
    /** The failure of the last load, or null. */
    error: PlaybackError | null;
    /** The source the consumer asked for. */
    source: string | null;
    /** The playback speed. Setting it drives the element when it exists. */
    get rate(): number;
    set rate(value: number);
    /** Point the element at a source and reset the published state. The
     * element stays unlocked, so a later play needs no new gesture. */
    load(source: string): void;
    /** Seek to a position in seconds. */
    seek(seconds: number): void;
    /** Pause the element. */
    pause(): void;
    /** Unlock the element for this session, then play a source. A refused
     * unlock or play returns false and never throws. */
    play(source?: string): Promise<boolean>;
    /** Spend the first gesture on the element. Later calls reuse the same
     * promise, so the priming play runs once per session. A refused prime
     * clears the promise, so the next gesture retries. */
    unlock(): Promise<boolean>;
}
