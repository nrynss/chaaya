import type { TranscriptWord } from "./transcript.js";
/**
 * Timed words arriving on a generic event stream, turned into the array
 * `TranscriptEditor` takes. The bridge names no backend event and does not
 * import Keel. It also does not import the editor, so the editor stays a
 * fixed word list.
 */
/** One timed word a stream may carry. `index` revises a word already kept.
 * An index equal to the current length appends. Times are source seconds. */
export interface TimedWordInput {
    readonly start: number;
    readonly end: number;
    readonly text: string;
    readonly speaker?: string;
    readonly index?: number;
}
/** The slice of an SSE frame this bridge reads. A comment is ignored.
 * `createEventStream` hands `onFrame` a `{ name, data }` value, which is enough. */
export interface TranscriptFrame {
    readonly kind?: "event" | "comment";
    readonly name?: string;
    readonly data?: string;
}
/** How one frame changed the word list. `ignore` and `invalid` leave the
 * list as it was. */
export type TranscriptApply = {
    readonly type: "append";
    readonly index: number;
    readonly word: TranscriptWord;
} | {
    readonly type: "revise";
    readonly index: number;
    readonly word: TranscriptWord;
} | {
    readonly type: "snapshot";
    readonly words: readonly TranscriptWord[];
} | {
    readonly type: "done";
} | {
    readonly type: "ignore";
} | {
    readonly type: "invalid";
    readonly reason: string;
};
/** What `createTranscriptBridge` needs. Omit `events` to read every named
 * event. `doneEvent` ends the list even when it is absent from `events`. */
export interface TranscriptBridgeOptions {
    /** Event names that carry words. Omit to accept every named event. */
    readonly events?: readonly string[];
    /** The event name that ends the stream. Omit and no event ends it.
     * The payload is not read. */
    readonly doneEvent?: string;
    /** Accept a JSON array, or an object `{ words: [...] }`, as a full
     * replacement. Default true. */
    readonly snapshots?: boolean;
    /** Read a payload yourself. Return null to ignore the frame. A thrown
     * error becomes `invalid` and leaves the list alone. */
    readonly parse?: (data: string, name: string) => TimedWordInput | readonly TimedWordInput[] | null;
}
/** A growing transcript. `words` is the editor input once the caller is
 * ready to construct one. `ordered` sorts a copy by source time. */
export interface TranscriptBridge {
    readonly words: readonly TranscriptWord[];
    readonly done: boolean;
    apply(frame: TranscriptFrame): TranscriptApply;
    /** A copy sorted by start, then end, then arrival. The stored list stays
     * in arrival order. */
    ordered(): readonly TranscriptWord[];
    reset(): void;
}
/**
 * Fold timed-word frames into `TranscriptWord`s.
 *
 * A frame is a comment, a done event, one word, or a snapshot. Anything else
 * is ignored, including a payload that is not a word. A payload that is a
 * word but fails a field is `invalid`, and the list does not change.
 *
 * After the done event, later frames are ignored until `reset`. The bridge
 * does not close the socket. `createEventStream` does that with `terminal`,
 * and that name has to sit in the stream's own `events` list or the stream
 * drops the frame before this bridge sees it. This bridge's `doneEvent` is
 * not dropped by its own `events` filter.
 *
 * `TranscriptEditor` keeps the word list it was constructed with, and cuts
 * are indexes into that list. Build the editor when the stream is done, or
 * when a snapshot will not shift earlier indexes. Appending at the end does
 * not move earlier indexes. A snapshot can. This bridge does not edit the
 * editor.
 */
export declare function createTranscriptBridge(options?: TranscriptBridgeOptions): TranscriptBridge;
