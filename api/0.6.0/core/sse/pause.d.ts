/** Whether the page can hold a stream right now. A hidden page cannot run
 * one, because a mobile browser suspends its fetch. An offline page cannot
 * reach one either. Both readings happen on each call, so a test that flips
 * visibility or network sees the flip at once. Importing this module touches
 * nothing, so a server import stays safe. */
export declare function isPaused(): boolean;
/** Run `onPause` while the page cannot hold a stream and `onResume` once it
 * can again. Both callbacks must tolerate repeats, because a visibility flip
 * and a network flip can report the same state twice. The returned function
 * removes the listeners. With no document or window it returns at once, so a
 * server caller needs no guard of its own. */
export declare function watchPause(onPause: () => void, onResume: () => void): () => void;
