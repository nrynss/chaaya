/** The three ways playback fails. A network failure means the bytes never
 * arrived. A decode failure means they arrived and the browser could not
 * read them. An output failure means they read fine but the audio sink could
 * not carry them, so the element keeps playing without sound. */
export type PlaybackFailure = "network" | "decode" | "output";
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
/** A refused play, carrying the browser refusal name and message. */
export interface PlayRefusal {
    readonly name: string;
    readonly message: string;
}
/** The element a player drives when the caller owns it. A video element in
 * the caller's markup is the common case. Without one the player creates its
 * own audio element. */
export interface AudioPlayerOptions {
    /** The element the caller owns. The player attaches its listeners to it
     * and drives its source through load and play, so the caller hands
     * sources to the player and not to the element. The element stays the
     * caller's to render and to size. */
    readonly element: HTMLMediaElement;
    /** A fresh source for an expired one. The player calls it when a
     * network failure lands and budget stays, then swaps to the answer. */
    readonly resolveSource?: () => string | Promise<string>;
    /** How many recoveries one source may spend. Defaults to 3. */
    readonly resolveBudget?: number;
}
/** One media element per app, unlocked by the first gesture and reused for
 * every clip. A browser blocks playback that no gesture started, so the first
 * user gesture primes the element with a silent clip. Every later clip reuses
 * that element, which keeps the unlocked state alive. The element is one the
 * caller owns, such as a `<video>` element, or one the player creates. */
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
    /** The refusal of the last play or unlock, or null. A successful play
     * clears it, so it always names the latest refusal. */
    lastPlayError: PlayRefusal | null;
    /** The source the consumer asked for. */
    source: string | null;
    /** How many source recoveries ran. A test reads it without listening. */
    recoveries: number;
    /** A fresh source for an expired one. Set it to opt into recovery. */
    resolveSource: (() => string | Promise<string>) | null;
    /** How many recoveries one source may spend. */
    resolveBudget: number;
    /** Build a player. Pass an element the caller owns to drive it, or
     * nothing to let the player create its own audio element. */
    constructor(options?: AudioPlayerOptions);
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
     * unlock or play returns false and never throws. A refusal sets
     * lastPlayError with the browser name and message, and a success
     * clears it. */
    play(source?: string): Promise<boolean>;
    /** Spend the first gesture on the element. Later calls reuse the same
     * promise, so the priming play runs once per session. A refused prime
     * clears the promise, so the next gesture retries. */
    unlock(): Promise<boolean>;
}
