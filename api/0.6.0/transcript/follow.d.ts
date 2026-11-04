import { Notifier } from "../core/observable.js";
import type { TranscriptEditor } from "./editor.js";
/** The least a clock needs to follow a transcript. A player meets it, and a
 * fake meets it in a logic check. */
export interface TranscriptClock {
    /** The position the clock reports, in source seconds. */
    currentTime: number;
    /** Move the position to a source second. */
    seek(seconds: number): void;
    /** Hear each position change, and get back a function that stops
     * listening. An `AudioPlayer` and a `mediaClock` both provide it. */
    subscribe(listener: () => void): () => void;
}
/** Read a caller owned media element as a transcript clock. The binding
 * reads the element clock on every access and never starts a wall clock
 * timer. Its subscribe listens to the element's `timeupdate`, `seeking` and
 * `seeked` events. A player driving the same element meets the contract
 * too, and its published position stays reactive while the element plays. */
export declare function mediaClock(element: HTMLMediaElement): TranscriptClock;
/** Bind one editor to one clock. The word under the playhead is derived
 * state a consumer renders however it likes. A word click seeks playback to
 * that word start, and the follower skips every cut span rather than playing
 * it. Construction touches nothing, so importing this module on a server is
 * safe.
 *
 * The follower is an observable. While attached it hears the clock and the
 * editor, skips each cut the playhead enters, and notifies once each time
 * `activeWord` changes. */
export declare class TranscriptFollower extends Notifier {
    #private;
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
    /** Follow the edited timeline, and get back the teardown. Each clock
     * move and each editor change runs `update`, so a position inside a cut
     * seeks to the span end and the cut stays silent. A clock move or an editor change
     * notifies once when `activeWord` changed. A Svelte component calls
     * `attach(follower)` from `@nrynss/chaaya/svelte`. */
    attach(): () => void;
}
