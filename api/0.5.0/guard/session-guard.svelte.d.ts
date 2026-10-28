/** What the guard needs to close one live session. */
export interface SessionGuardOptions {
    /** The endpoint that receives the close notice. */
    readonly url: string;
    /**
     * The body the close carries, read when the close goes. The guard calls it
     * once per close, never at construction or attach(), so the close carries
     * a value learned after attach(). A function that throws costs the body,
     * never the close attempt. Leave it out to send no body.
     *
     * The body is a string, a Blob, a buffer or a URLSearchParams, and it may
     * come from another frame. The guard sends a body of 64 KiB or less. It
     * drops a larger body and sends the close bare, so the browser has no
     * oversized body to refuse. It sends any other value from untyped code
     * bare too, such as a FormData or a stream. A buffer that can resize or
     * is shared goes as a fixed copy of its bytes, because a browser may
     * refuse one as it is.
     *
     * A buffer, or a Blob with no type, goes with no Content-Type header. Some
     * servers read such a body as empty, and SvelteKit's Node reader is one of
     * them. Send a string, or a Blob with a type, when the endpoint needs one.
     *
     * The guard makes exactly one close attempt, by beacon or by keepalive
     * request, and it cannot promise delivery. The browser may refuse that
     * attempt when its keepalive limits are spent. The page shares one byte
     * budget across every keepalive request in flight, and a body adds to it.
     * Some browsers also cap how many keepalive requests are in flight. Beacon
     * limits differ between browsers. The guard cannot see the page's other
     * requests, so keep the body small.
     */
    readonly body?: () => string | Blob | BufferSource | URLSearchParams | null;
}
/**
 * Closes one live session when its page goes away.
 *
 * A page that holds a session builds one guard, calls attach() after it
 * mounts, and calls destroy() when it is destroyed. The guard sends its
 * close on pagehide and on destroy. A latch keeps the first send while
 * later ones do nothing, so the pair makes exactly one close attempt.
 *
 * Building a guard touches no browser global. Only attach(), close() and
 * destroy() reach the window, so a server render may build one freely.
 */
export declare class SessionGuard {
    #private;
    /** True once the close notice has gone. */
    closed: boolean;
    constructor(options: SessionGuardOptions);
    /**
     * Listen for the page going away. Call after mount, so no server render
     * touches the window. A second call does nothing.
     */
    attach(): void;
    /**
     * Tell the server the session is leaving. The first call makes the one
     * close attempt, and every later call does nothing. The attempt goes by
     * beacon when the browser offers one and takes it, and by a keepalive
     * request otherwise, so it can outlive the page. Either path carries the
     * one body this close read.
     */
    close(): void;
    /**
     * Stop listening, and send the close when it has not gone. Call on
     * destroy, so a navigation that never fired pagehide still closes.
     */
    destroy(): void;
}
