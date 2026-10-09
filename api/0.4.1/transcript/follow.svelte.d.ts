import type { TranscriptEditor } from "./editor.svelte.js";
/** The least a clock needs to follow a transcript. A player meets it, and a
 * fake meets it in a logic check. */
export interface TranscriptClock {
    /** The position the clock reports, in source seconds. */
    currentTime: number;
    /** Move the position to a source second. */
    seek(seconds: number): void;
}
/** Read a caller owned media element as a transcript clock. The binding
 * reads the element clock on every access and never starts a wall clock
 * timer. A player driving the same element meets the contract too, and its
 * published position stays reactive while the element plays. */
export declare function mediaClock(element: HTMLMediaElement): TranscriptClock;
/** Bind one editor to one clock. The word under the playhead is derived
 * state a consumer renders however it likes. A word click seeks playback to
 * that word start, and the follower skips every cut span rather than playing
 * it. Construction touches nothing, so importing this module on a server is
 * safe. */
export declare class TranscriptFollower {
    /** The editor carrying the words and the cuts. */
    readonly editor: TranscriptEditor;
    /** The clock carrying playback. */
    readonly clock: TranscriptClock;
    constructor(editor: TranscriptEditor, clock: TranscriptClock);
    /** The word sounding at the playhead, or null in a gap, in a cut, or
     * past the last word. */
    get activeWord(): number | null;
    /** Seek playback to one word start. */
    seekToWord(index: number): void;
    /** Skip the playhead out of a cut once, and report where it resumed. A
     * position outside every cut plays on and reports null. */
    update(): number | null;
    /** Follow the edited timeline while the caller lives. Call it once during
     * component initialisation. The read runs inside the caller effect, so it
     * tracks the clock and reruns on every move. A passing position inside a
     * cut seeks to the span end, so the cut stays silent. A test passes its
     * own cleanup runner, because only a component owns the effect context
     * the default runner needs. */
    follow(registerCleanup?: (task: () => () => void) => void): void;
}
