/**
 * One normalised share. Every field is optional, because some senders carry
 * only a title. At least one field is present, or there is no payload.
 */
export interface SharedPayload {
    /** The shared link, pulled from the text when the sender put it there. */
    readonly url?: string;
    /** The shared words, as the sender wrote them. */
    readonly text?: string;
    /** The shared title, when the sender named one. */
    readonly title?: string;
}
/** Trim a query param of a shared link. Return true to drop it. */
export type TrackParamFilter = (name: string, value: string) => boolean;
/** What `readSharedPayload` needs. */
export interface ReadShareOptions {
    /** Trim a query param of the shared link when this answers true. Omit to keep every param. */
    readonly dropParam?: TrackParamFilter;
}
/**
 * The first link inside free text, or undefined when there is none. Keeps
 * encoded characters as they are, because decoding belongs to the URL read.
 */
export declare function extractFirstUrl(text: string): string | undefined;
/**
 * Normalise a launch URL into one payload. Reads title, text, and url params.
 * When url is missing, pulls the first link out of text. Trims link params
 * the caller filter refuses. Answers undefined when all three are empty.
 */
export declare function readSharedPayload(source: URL | string, options?: ReadShareOptions): SharedPayload | undefined;
/** A share handler. One handler serves the web share and a native intent. */
export type ShareHandler = (payload: SharedPayload) => void;
/**
 * One native intake seam. A native shell emits through `emit`, and app code
 * subscribes once, beside the web launch read. Both carry `SharedPayload`.
 */
export interface ShareSource {
    /** Listen for native shares. The returned function unsubscribes. */
    subscribe(handler: ShareHandler): () => void;
}
/** A testable native seam. The app wires a real shell where this is a stub. */
export declare function createShareSource(): {
    source: ShareSource;
    emit(payload: SharedPayload): void;
};
